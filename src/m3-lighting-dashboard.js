class M3LightingDashboard extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this._config = null;
    this._hass = null;
    this._expandedAreas = new Set();
    this._slidingEntityIds = new Set();
    this._sliderPendingTargets = new Map();
    this._hoveredUiKey = null;
    this._pressedUiKey = null;
    this._deferredRenderPending = false;
    this._sliderCooldownTimers = new Map();
    this._boundClick = this._handleClick.bind(this);
    this._boundContextMenu = this._handleContextMenu.bind(this);
    this._boundPointerOver = this._handlePointerOver.bind(this);
    this._boundPointerOut = this._handlePointerOut.bind(this);
    this._boundPointerDown = this._handlePointerDown.bind(this);
    this._boundPointerUp = this._handlePointerUp.bind(this);
    this._boundPointerCancel = this._handlePointerCancel.bind(this);
    this._boundSliderInteractionStart = this._handleSliderInteractionStart.bind(this);
    this._boundSliderInteractionEnd = this._handleSliderInteractionEnd.bind(this);
  }

  connectedCallback() {
    this.shadowRoot?.addEventListener("click", this._boundClick);
    this.shadowRoot?.addEventListener("contextmenu", this._boundContextMenu);
    this.shadowRoot?.addEventListener("pointerover", this._boundPointerOver);
    this.shadowRoot?.addEventListener("pointerout", this._boundPointerOut);
    this.shadowRoot?.addEventListener("pointerdown", this._boundPointerDown);
    this.shadowRoot?.addEventListener("m3-slider-interaction-start", this._boundSliderInteractionStart);
    this.shadowRoot?.addEventListener("m3-slider-interaction-end", this._boundSliderInteractionEnd);
    window.addEventListener("pointerup", this._boundPointerUp);
    window.addEventListener("pointercancel", this._boundPointerCancel);
    if (!customElements.get("m3-slider")) {
      customElements.whenDefined("m3-slider").then(() => {
        if (this.isConnected) {
          this._render();
        }
      }).catch(() => {});
    }
  }

  disconnectedCallback() {
    this.shadowRoot?.removeEventListener("click", this._boundClick);
    this.shadowRoot?.removeEventListener("contextmenu", this._boundContextMenu);
    this.shadowRoot?.removeEventListener("pointerover", this._boundPointerOver);
    this.shadowRoot?.removeEventListener("pointerout", this._boundPointerOut);
    this.shadowRoot?.removeEventListener("pointerdown", this._boundPointerDown);
    this.shadowRoot?.removeEventListener("m3-slider-interaction-start", this._boundSliderInteractionStart);
    this.shadowRoot?.removeEventListener("m3-slider-interaction-end", this._boundSliderInteractionEnd);
    window.removeEventListener("pointerup", this._boundPointerUp);
    window.removeEventListener("pointercancel", this._boundPointerCancel);
    this._sliderCooldownTimers.forEach((timerId) => clearTimeout(timerId));
    this._sliderCooldownTimers.clear();
    this._sliderPendingTargets.clear();
  }

  setConfig(config) {
    if (!Array.isArray(config?.areas) || !config.areas.length) {
      throw new Error("m3-lighting-dashboard requires a non-empty areas array");
    }

    this._config = {
      title: String(config.title || "Lighting"),
      subtitle: String(config.subtitle || ""),
      areas: config.areas.map((area, index) => this._normalizeArea(area, index)),
    };

    const preserved = new Set();
    for (const area of this._config.areas) {
      const defaultExpanded = area.expanded ?? area.entities.length > 1;
      if (this._expandedAreas.has(area.key) || defaultExpanded) {
        preserved.add(area.key);
      }
    }
    this._expandedAreas = preserved;

    this._render();
  }

  set hass(hass) {
    this._hass = hass;
    this._reconcileSettledSliders();
    if (this._slidingEntityIds.size || this._pressedUiKey) {
      this._deferredRenderPending = true;
      this._syncEmbeddedSliders();
      return;
    }
    this._deferredRenderPending = false;
    this._render();
  }

  getCardSize() {
    return Math.max(6, (this._config?.areas?.length || 4) * 2);
  }

  static getStubConfig() {
    return {
      type: "custom:m3-lighting-dashboard",
      title: "Lighting",
      areas: [
        {
          title: "Main Bedroom",
          icon: "mdi:bed",
          entities: [{ entity: "switch.laura_lamp", name: "Laura Lamp" }],
        },
        {
          title: "Girl Bathroom",
          icon: "mdi:bathtub",
          expanded: true,
          entities: [
            { entity: "switch.youre_pretty", name: "You're Really Pretty" },
            { entity: "light.washer_dryer", name: "Washer & Dryer" },
            { entity: "light.shower", name: "Shower" },
            { entity: "light.toilet", name: "Toilet" },
          ],
        },
      ],
    };
  }

  _normalizeArea(area, index) {
    if (!area || typeof area !== "object") {
      throw new Error("Each area must be an object");
    }
    if (!area.title) {
      throw new Error("Each area requires a title");
    }
    if (!Array.isArray(area.entities) || !area.entities.length) {
      throw new Error(`Area "${area.title}" requires a non-empty entities array`);
    }

    const normalizedEntities = area.entities.map((item) => {
      if (typeof item === "string") {
        return { entity: item, name: "", icon: "" };
      }
      if (!item?.entity) {
        throw new Error(`Area "${area.title}" contains an entity without an entity id`);
      }
      return {
        entity: String(item.entity),
        name: item.name ? String(item.name) : "",
        icon: item.icon ? String(item.icon) : "",
      };
    });

    const slug = String(area.title)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");

    return {
      key: area.id ? String(area.id) : `area-${index}-${slug || index}`,
      title: String(area.title),
      icon: area.icon ? String(area.icon) : "",
      expanded:
        area.expanded === true || area.expanded === false
          ? area.expanded
          : undefined,
      entities: normalizedEntities,
    };
  }

  _handleClick(event) {
    const target = event.target instanceof Element ? event.target.closest("[data-action]") : null;
    if (!target || !this._config || !this._hass) {
      return;
    }

    event.preventDefault();
    const action = target.dataset.action;

    if (action === "turn-all-on") {
      this._setEntitiesState(this._allEntityIds(), true);
      return;
    }
    if (action === "turn-all-off") {
      this._setEntitiesState(this._allEntityIds(), false);
      return;
    }
    if (action === "toggle-area") {
      const key = target.dataset.areaKey;
      if (key) {
        if (this._expandedAreas.has(key)) {
          this._expandedAreas.delete(key);
        } else {
          this._expandedAreas.add(key);
        }
        this._render();
      }
      return;
    }
    if (action === "toggle-entity") {
      const entityId = target.dataset.entity;
      if (entityId) {
        this._toggleEntity(entityId);
      }
    }
  }

  _handleContextMenu(event) {
    const target = event.target instanceof Element ? event.target.closest("[data-entity]") : null;
    if (!target) {
      return;
    }
    event.preventDefault();
    const entityId = target.dataset.entity;
    if (!entityId) {
      return;
    }
    this.dispatchEvent(new CustomEvent("hass-more-info", {
      detail: { entityId },
      bubbles: true,
      composed: true,
    }));
  }

  _interactiveTarget(target) {
    return target instanceof Element ? target.closest("button[data-ui-key]") : null;
  }

  _setHoveredUiKey(uiKey) {
    if (this._hoveredUiKey === uiKey) {
      return;
    }
    this._hoveredUiKey = uiKey;
    this._syncInteractionClasses();
  }

  _setPressedUiKey(uiKey) {
    if (this._pressedUiKey === uiKey) {
      return;
    }
    this._pressedUiKey = uiKey;
    this._syncInteractionClasses();
  }

  _syncInteractionClasses() {
    const buttons = this.shadowRoot?.querySelectorAll("button[data-ui-key]");
    if (!buttons) {
      return;
    }

    buttons.forEach((button) => {
      const uiKey = button.dataset.uiKey || "";
      button.classList.toggle("is-hovered", uiKey === this._hoveredUiKey);
      button.classList.toggle("is-pressed", uiKey === this._pressedUiKey);
    });
  }

  _handlePointerOver(event) {
    const target = this._interactiveTarget(event.target);
    if (!target) {
      return;
    }

    const relatedTarget = this._interactiveTarget(event.relatedTarget);
    if (relatedTarget?.dataset.uiKey === target.dataset.uiKey) {
      return;
    }

    this._setHoveredUiKey(target.dataset.uiKey || null);
  }

  _handlePointerOut(event) {
    const target = this._interactiveTarget(event.target);
    if (!target) {
      return;
    }

    const relatedTarget = this._interactiveTarget(event.relatedTarget);
    if (relatedTarget?.dataset.uiKey === target.dataset.uiKey) {
      return;
    }

    if (this._pressedUiKey === (target.dataset.uiKey || "")) {
      return;
    }

    if (this._hoveredUiKey === (target.dataset.uiKey || "")) {
      this._setHoveredUiKey(null);
    }
  }

  _handlePointerDown(event) {
    if (event.button !== 0) {
      return;
    }

    const target = this._interactiveTarget(event.target);
    if (!target) {
      return;
    }

    const uiKey = target.dataset.uiKey || null;
    this._setHoveredUiKey(uiKey);
    this._setPressedUiKey(uiKey);
  }

  _handlePointerUp() {
    this._setPressedUiKey(null);
    this._flushDeferredRender();
  }

  _handlePointerCancel() {
    this._setPressedUiKey(null);
    this._setHoveredUiKey(null);
    this._flushDeferredRender();
  }

  _handleSliderInteractionStart(event) {
    const entityId = event.detail?.entityId;
    if (!entityId) {
      return;
    }
    const existingTimer = this._sliderCooldownTimers.get(entityId);
    if (existingTimer) {
      clearTimeout(existingTimer);
      this._sliderCooldownTimers.delete(entityId);
    }
    this._sliderPendingTargets.delete(entityId);
    this._slidingEntityIds.add(entityId);
  }

  _handleSliderInteractionEnd(event) {
    const entityId = event.detail?.entityId;
    if (!entityId) {
      return;
    }
    const existingTimer = this._sliderCooldownTimers.get(entityId);
    if (existingTimer) {
      clearTimeout(existingTimer);
    }
    const targetValue = Number(event.detail?.targetValue);
    if (Number.isFinite(targetValue)) {
      this._sliderPendingTargets.set(entityId, Math.max(0, Math.min(100, Math.round(targetValue))));
    } else {
      this._sliderPendingTargets.delete(entityId);
    }
    const cooldownMs = 30000;
    const timerId = window.setTimeout(() => {
      this._sliderCooldownTimers.delete(entityId);
      this._sliderPendingTargets.delete(entityId);
      this._slidingEntityIds.delete(entityId);
      this._flushDeferredRender();
    }, cooldownMs);
    this._sliderCooldownTimers.set(entityId, timerId);
  }

  _reconcileSettledSliders() {
    if (!this._hass || !this._slidingEntityIds.size) {
      return;
    }

    for (const entityId of [...this._slidingEntityIds]) {
      const stateObj = this._state(entityId);
      if (!stateObj || ["unknown", "unavailable"].includes(stateObj.state)) {
        continue;
      }

      const target = this._sliderPendingTargets.get(entityId);
      let settled = false;

      if (Number.isFinite(target)) {
        if (target <= 0) {
          settled = !this._isOn(stateObj);
        } else if (this._supportsBrightness(stateObj)) {
          settled = Math.abs(this._brightnessPct(stateObj) - target) <= 1;
        } else {
          settled = this._isOn(stateObj);
        }
      } else {
        settled = true;
      }

      if (!settled) {
        continue;
      }

      const timerId = this._sliderCooldownTimers.get(entityId);
      if (timerId) {
        clearTimeout(timerId);
        this._sliderCooldownTimers.delete(entityId);
      }
      this._sliderPendingTargets.delete(entityId);
      this._slidingEntityIds.delete(entityId);
    }
  }

  _flushDeferredRender() {
    if (!this._deferredRenderPending) {
      return;
    }
    if (this._slidingEntityIds.size || this._pressedUiKey) {
      return;
    }
    this._deferredRenderPending = false;
    this._render();
  }

  _state(entityId) {
    return this._hass?.states?.[entityId] || null;
  }

  _allEntityIds() {
    const ids = new Set();
    for (const area of this._config?.areas || []) {
      for (const entity of area.entities) {
        ids.add(entity.entity);
      }
    }
    return [...ids];
  }

  _isOn(stateObj) {
    return stateObj?.state === "on";
  }

  _isUnavailable(stateObj) {
    return !stateObj || ["unavailable", "unknown"].includes(stateObj.state);
  }

  _supportsBrightness(stateObj) {
    if (!stateObj) {
      return false;
    }
    if (!String(stateObj.entity_id || "").startsWith("light.")) {
      return false;
    }
    if (["unknown", "unavailable"].includes(stateObj.state)) {
      return false;
    }
    if (typeof stateObj.attributes?.brightness === "number") {
      return true;
    }
    const supportedModes = stateObj.attributes?.supported_color_modes;
    if (!Array.isArray(supportedModes)) {
      return false;
    }
    return supportedModes.some((mode) =>
      [
        "brightness",
        "color_temp",
        "hs",
        "xy",
        "rgb",
        "rgbw",
        "rgbww",
        "white",
      ].includes(mode)
    );
  }

  _brightnessPct(stateObj) {
    const brightness = Number(stateObj?.attributes?.brightness);
    if (!Number.isFinite(brightness) || brightness <= 0) {
      return 0;
    }
    return Math.max(1, Math.min(100, Math.round((brightness / 255) * 100)));
  }

  _entityName(item) {
    const stateObj = this._state(item.entity);
    if (item.name) {
      return item.name;
    }
    const friendly = stateObj?.attributes?.friendly_name;
    if (friendly) {
      return friendly;
    }
    return item.entity.split(".").pop().replaceAll("_", " ");
  }

  _defaultEntityIcon(item, stateObj) {
    if (item.icon) {
      return item.icon;
    }
    if (stateObj?.attributes?.icon) {
      return stateObj.attributes.icon;
    }
    if (item.entity.startsWith("light.")) {
      return "mdi:lightbulb";
    }
    if (item.entity.startsWith("switch.")) {
      return "mdi:power-plug";
    }
    return "mdi:lightbulb";
  }

  _filledM3Icon(icon) {
    const raw = String(icon || "");
    const [setName, iconName] = raw.split(":");
    if (!setName || !iconName) {
      return raw;
    }
    if (setName === "m3r" || setName === "m3rf") {
      return `m3rf:${iconName}`;
    }
    if (raw === "mdi:lightbulb") {
      return "mdi:lightbulb-on";
    }
    return raw;
  }

  _sliderInsetIcon(item, stateObj) {
    const baseIcon =
      item.icon ||
      stateObj?.attributes?.icon ||
      (item.entity.startsWith("light.") ? "mdi:lightbulb" : this._defaultEntityIcon(item, stateObj));
    return this._filledM3Icon(baseIcon);
  }

  _hasCoreCardsDependency() {
    return Boolean(customElements.get("m3-slider"));
  }

  _entitySummary(item) {
    const stateObj = this._state(item.entity);
    if (this._isUnavailable(stateObj)) {
      return "Unavailable";
    }
    if (!this._isOn(stateObj)) {
      return "Off";
    }
    if (this._supportsBrightness(stateObj)) {
      const brightness = this._brightnessPct(stateObj);
      if (brightness > 0) {
        return `On · ${brightness}%`;
      }
    }
    return "On";
  }

  _areaStats(area) {
    let total = 0;
    let onCount = 0;
    const brightnessValues = [];
    for (const item of area.entities) {
      const stateObj = this._state(item.entity);
      if (!stateObj) {
        continue;
      }
      total += 1;
      if (this._isOn(stateObj)) {
        onCount += 1;
        if (this._supportsBrightness(stateObj)) {
          const brightness = this._brightnessPct(stateObj);
          if (brightness > 0) {
            brightnessValues.push(brightness);
          }
        }
      }
    }
    const avgBrightness = brightnessValues.length
      ? Math.round(brightnessValues.reduce((sum, value) => sum + value, 0) / brightnessValues.length)
      : 0;
    return { total, onCount, avgBrightness };
  }

  _dashboardSummary() {
    const areas = this._config?.areas || [];
    const totalDevices = this._allEntityIds().length;
    const activeAreas = areas.filter((area) => this._areaStats(area).onCount > 0).length;
    const areaLabel = activeAreas === 1 ? "area" : "areas";
    return `${totalDevices} devices · ${activeAreas} ${areaLabel} active`;
  }

  _globalState() {
    const ids = this._allEntityIds();
    const stateObjects = ids.map((entityId) => this._state(entityId)).filter(Boolean);
    if (!stateObjects.length) {
      return "mixed";
    }
    const onCount = stateObjects.filter((stateObj) => this._isOn(stateObj)).length;
    if (onCount === 0) {
      return "all-off";
    }
    if (onCount === stateObjects.length) {
      return "all-on";
    }
    return "mixed";
  }

  _singleAreaSubtitle(area) {
    const [item] = area.entities;
    return `${this._entityName(item)} · ${this._entitySummary(item)}`;
  }

  _multiAreaSubtitle(area) {
    const { total, onCount, avgBrightness } = this._areaStats(area);
    if (onCount === 0) {
      return `${total} devices · Off`;
    }
    if (avgBrightness > 0) {
      return `${onCount} on · ${avgBrightness}% avg`;
    }
    return `${onCount} on`;
  }

  async _toggleEntity(entityId) {
    if (!this._hass || !entityId) {
      return;
    }
    await this._hass.callService("homeassistant", "toggle", { entity_id: entityId });
  }

  async _setEntitiesState(entityIds, on) {
    if (!this._hass || !Array.isArray(entityIds) || !entityIds.length) {
      return;
    }
    await this._hass.callService(
      "homeassistant",
      on ? "turn_on" : "turn_off",
      { entity_id: entityIds }
    );
  }

  _escape(value) {
    return String(value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#39;");
  }

  _singleAreaMarkup(area) {
    const [item] = area.entities;
    const stateObj = this._state(item.entity);
    const active = this._isOn(stateObj);
    const summary = this._singleAreaSubtitle(area);
    const icon = this._defaultEntityIcon({ ...item, icon: item.icon || area.icon }, stateObj);
    const supportsBrightness = this._supportsBrightness(stateObj);

    if (supportsBrightness) {
      return `
        <section
          class="room-card room-card-single-slider ${active ? "is-active" : ""} ${this._isUnavailable(stateObj) ? "is-unavailable" : ""}"
          data-entity="${this._escape(item.entity)}"
        >
          <div class="room-slider-header">
            <span class="room-copy">
              <span class="room-title">${this._escape(area.title)}</span>
              <span class="room-subtitle">${this._escape(summary)}</span>
            </span>
          </div>
          <div class="room-slider-wrap">
            ${this._sliderMarkup(item, area, { size: "m", showInsetIcon: true })}
          </div>
        </section>
      `;
    }

    return `
      <button
        type="button"
        class="room-card room-card-single ${active ? "is-active" : ""} ${this._isUnavailable(stateObj) ? "is-unavailable" : ""}"
        data-action="toggle-entity"
        data-entity="${this._escape(item.entity)}"
        data-ui-key="entity:${this._escape(item.entity)}"
        aria-pressed="${active ? "true" : "false"}"
      >
        <span class="room-icon-shell">
          <ha-icon class="room-icon" icon="${this._escape(icon)}"></ha-icon>
        </span>
        <span class="room-copy">
          <span class="room-title">${this._escape(area.title)}</span>
          <span class="room-subtitle">${this._escape(summary)}</span>
        </span>
      </button>
    `;
  }

  _multiAreaMarkup(area) {
    const active = this._areaStats(area).onCount > 0;
    const expanded = this._expandedAreas.has(area.key);
    const bodyClass = area.entities.length === 1 ? "device-grid single" : "device-grid";

    const deviceMarkup = area.entities
      .map((item) => {
        const stateObj = this._state(item.entity);
        const on = this._isOn(stateObj);
        const supportsBrightness = this._supportsBrightness(stateObj);

        if (supportsBrightness) {
          return `
            <div
              class="device-card device-card-slider ${on ? "is-on" : ""} ${this._isUnavailable(stateObj) ? "is-unavailable" : ""}"
              data-entity="${this._escape(item.entity)}"
            >
              <div class="device-card-header">
                <span class="device-copy">
                  <span class="device-name">${this._escape(this._entityName(item))}</span>
                  <span class="device-summary">${this._escape(this._entitySummary(item))}</span>
                </span>
              </div>
              <div class="device-slider-wrap">
                ${this._sliderMarkup(item, area, { size: "m", showInsetIcon: true })}
              </div>
            </div>
          `;
        }

        return `
          <button
            type="button"
            class="device-card ${on ? "is-on" : ""} ${this._isUnavailable(stateObj) ? "is-unavailable" : ""}"
            data-action="toggle-entity"
            data-entity="${this._escape(item.entity)}"
            data-ui-key="entity:${this._escape(item.entity)}"
            aria-pressed="${on ? "true" : "false"}"
          >
            <span class="device-icon-shell">
              <ha-icon class="device-icon" icon="${this._escape(this._defaultEntityIcon(item, stateObj))}"></ha-icon>
            </span>
            <span class="device-copy">
              <span class="device-name">${this._escape(this._entityName(item))}</span>
              <span class="device-summary">${this._escape(this._entitySummary(item))}</span>
            </span>
          </button>
        `;
      })
      .join("");

    return `
      <section class="room-card room-card-multi ${active ? "is-active" : ""} ${expanded ? "is-expanded" : ""}">
        <button
          type="button"
          class="room-main"
          data-action="toggle-area"
          data-area-key="${this._escape(area.key)}"
          data-ui-key="area:${this._escape(area.key)}"
          aria-expanded="${expanded ? "true" : "false"}"
        >
          <span class="room-icon-shell">
            <ha-icon class="room-icon" icon="${this._escape(area.icon || "mdi:lightbulb-group")}"></ha-icon>
          </span>
          <span class="room-copy">
            <span class="room-title">${this._escape(area.title)}</span>
            <span class="room-subtitle">${this._escape(this._multiAreaSubtitle(area))}</span>
          </span>
        <span class="room-chevron ${expanded ? "is-open" : ""}">
            <ha-icon icon="mdi:chevron-down"></ha-icon>
          </span>
        </button>
        <div class="room-body">
          <div class="room-body-inner">
            <div class="${bodyClass}">
              ${deviceMarkup}
            </div>
          </div>
        </div>
      </section>
    `;
  }

  _sliderMarkup(item, area, options = {}) {
    const stateObj = this._state(item.entity);
    const size = options.size || (area.entities.length > 1 ? "s" : "m");
    const icon = this._sliderInsetIcon(item, stateObj);
    const showInsetIcon = Boolean(options.showInsetIcon);

    return `
      <m3-slider
        entity="${this._escape(item.entity)}"
        size="${this._escape(size)}"
        ${showInsetIcon ? `icon="${this._escape(icon)}" show-inset-icon` : ""}
        show-value-indicator
        aria-label="${this._escape(this._entityName(item))}"
      ></m3-slider>
    `;
  }

  _syncEmbeddedSliders() {
    if (!this.shadowRoot || !this._hass) {
      return;
    }

    const apply = () => {
      this.shadowRoot?.querySelectorAll("m3-slider").forEach((slider) => {
        slider.hass = this._hass;
      });
    };

    if (customElements.get("m3-slider")) {
      apply();
      return;
    }

    customElements.whenDefined("m3-slider").then(apply).catch(() => {});
  }

  _render() {
    if (!this.shadowRoot || !this._config) {
      return;
    }

    if (!this._hasCoreCardsDependency()) {
      this.shadowRoot.innerHTML = `
        <style>
          :host {
            display: block;
          }

          ha-card {
            padding: 20px;
          }

          .dependency-title {
            margin: 0 0 8px;
            font-size: 1.25rem;
            font-weight: 600;
            color: var(--primary-text-color);
          }

          .dependency-body {
            margin: 0;
            color: var(--secondary-text-color);
            line-height: 1.5;
          }
        </style>
        <ha-card>
          <p class="dependency-title">Missing dependency: lovelace-m3-core-cards</p>
          <p class="dependency-body">
            Install and load <code>/hacsfiles/lovelace-m3-core-cards/lovelace-m3-core-cards.js</code>
            before using <code>custom:m3-lighting-dashboard</code>.
          </p>
        </ha-card>
      `;
      return;
    }

    const globalState = this._globalState();
    const areasMarkup = this._config.areas
      .map((area) => (area.entities.length > 1 ? this._multiAreaMarkup(area) : this._singleAreaMarkup(area)))
      .join("");

    this.shadowRoot.innerHTML = `
      <style>
        :host {
          display: block;
        }

        * {
          box-sizing: border-box;
        }

        ha-card {
          background: transparent;
          border: 0;
          box-shadow: none;
        }

        .dashboard-shell {
          --lighting-surface: var(--md-sys-color-surface, var(--card-background-color, #121318));
          --lighting-surface-low: var(--md-sys-color-surface-container-low, color-mix(in srgb, var(--lighting-surface) 92%, white 8%));
          --lighting-surface-high: var(--md-sys-color-surface-container-high, color-mix(in srgb, var(--lighting-surface) 84%, white 16%));
          --lighting-outline: var(--md-sys-color-outline-variant, rgba(255, 255, 255, 0.14));
          --lighting-on-surface: var(--md-sys-color-on-surface, var(--primary-text-color, #f2f1f7));
          --lighting-on-surface-variant: var(--md-sys-color-on-surface-variant, var(--secondary-text-color, rgba(242, 241, 247, 0.72)));
          --lighting-primary-container: var(--md-sys-color-primary-container, rgba(255, 222, 135, 0.2));
          --lighting-secondary-container: var(--md-sys-color-secondary-container, rgba(255, 236, 184, 0.16));
          --lighting-on-primary-container: var(--md-sys-color-on-primary-container, var(--lighting-on-surface));
          position: relative;
          max-width: 760px;
          margin: 0 auto;
          padding: 24px 16px 112px;
          color: var(--lighting-on-surface);
          font-family: var(--ha-font-family-body, Roboto, "Noto Sans", sans-serif);
          container-type: inline-size;
        }

        .dashboard-shell::before,
        .dashboard-shell::after {
          content: "";
          position: absolute;
          inset: auto;
          border-radius: 999px;
          pointer-events: none;
          filter: blur(48px);
          opacity: 0.42;
        }

        .dashboard-shell::before {
          width: 180px;
          height: 180px;
          top: 12px;
          right: 4px;
          background: color-mix(in srgb, var(--lighting-primary-container) 76%, transparent);
        }

        .dashboard-shell::after {
          width: 140px;
          height: 140px;
          top: 96px;
          left: -12px;
          background: color-mix(in srgb, var(--lighting-secondary-container) 82%, transparent);
        }

        .dashboard-content {
          position: relative;
          z-index: 1;
        }

        .hero {
          display: grid;
          gap: 8px;
          margin-bottom: 18px;
        }

        .hero-title {
          margin: 0;
          font-size: 32px;
          line-height: 40px;
          font-weight: 400;
          letter-spacing: 0;
        }

        .hero-subtitle {
          margin: 0;
          font-size: 16px;
          line-height: 24px;
          font-weight: 400;
          color: var(--lighting-on-surface-variant);
        }

        .master-controls {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 0;
          margin-bottom: 18px;
          padding: 4px;
          border-radius: 999px;
          background: color-mix(in srgb, var(--lighting-surface-low) 88%, transparent);
          border: 1px solid var(--lighting-outline);
          backdrop-filter: blur(18px);
        }

        .master-button {
          position: relative;
          border: 0;
          background: transparent;
          color: var(--lighting-on-surface);
          border-radius: 999px;
          min-height: 56px;
          font-size: 14px;
          line-height: 20px;
          font-weight: 500;
          letter-spacing: 0.00625rem;
          cursor: pointer;
          transition:
            background-color 160ms ease,
            color 160ms ease,
            transform 180ms cubic-bezier(0.2, 0.9, 0.25, 1);
        }

        .master-button::before,
        .room-card-single::before,
        .room-main::before,
        .device-card::before {
          content: "";
          position: absolute;
          inset: 0;
          border-radius: inherit;
          background: currentColor;
          opacity: 0;
          transition: opacity 120ms linear;
          pointer-events: none;
        }

        .master-button.is-hovered::before,
        .room-card-single.is-hovered::before,
        .room-main.is-hovered::before,
        .device-card.is-hovered::before {
          opacity: 0.08;
        }

        .master-button.is-pressed,
        .room-card-single.is-pressed,
        .room-main.is-pressed,
        .device-card.is-pressed {
          transform: scale(0.985);
        }

        .master-button.is-pressed::before,
        .room-card-single.is-pressed::before,
        .room-main.is-pressed::before,
        .device-card.is-pressed::before {
          opacity: 0.12;
        }

        .master-button.is-selected {
          background: linear-gradient(
            135deg,
            color-mix(in srgb, var(--lighting-primary-container) 96%, white 4%),
            color-mix(in srgb, var(--lighting-secondary-container) 92%, white 8%)
          );
          color: var(--lighting-on-primary-container);
          box-shadow: 0 10px 24px color-mix(in srgb, var(--lighting-primary-container) 32%, transparent);
        }

        .room-list {
          display: grid;
          gap: 14px;
        }

        .room-card,
        .room-card-single {
          position: relative;
          width: 100%;
          border: 1px solid var(--lighting-outline);
          background: color-mix(in srgb, var(--lighting-surface-low) 92%, transparent);
          color: var(--lighting-on-surface);
          border-radius: 28px;
          overflow: hidden;
          backdrop-filter: blur(18px);
          transition:
            border-color 180ms ease,
            background-color 180ms ease,
            box-shadow 180ms ease,
            transform 180ms cubic-bezier(0.2, 0.9, 0.25, 1);
        }

        .room-card.is-active,
        .room-card-single.is-active {
          background:
            radial-gradient(circle at top right, color-mix(in srgb, var(--lighting-secondary-container) 86%, transparent), transparent 46%),
            linear-gradient(
              135deg,
              color-mix(in srgb, var(--lighting-primary-container) 84%, var(--lighting-surface) 16%),
              color-mix(in srgb, var(--lighting-secondary-container) 72%, var(--lighting-surface) 28%)
            );
          border-color: color-mix(in srgb, var(--lighting-primary-container) 72%, var(--lighting-outline));
          box-shadow: 0 18px 38px color-mix(in srgb, black 16%, transparent);
        }

        .room-card-single,
        .room-main {
          border: 0;
          background: transparent;
          width: 100%;
          padding: 18px 18px 18px 16px;
          display: grid;
          grid-template-columns: auto 1fr auto;
          align-items: center;
          gap: 14px;
          text-align: left;
          cursor: pointer;
          color: inherit;
          font: inherit;
        }

        .room-main {
          position: relative;
        }

        .room-card-single {
          border-radius: 999px;
          background: var(--md-sys-color-surface-container, color-mix(in srgb, var(--lighting-surface) 84%, white 16%));
          color: var(--md-sys-color-on-surface-variant, var(--lighting-on-surface-variant));
          border-color: color-mix(in srgb, var(--lighting-outline) 88%, transparent);
          transition:
            transform 180ms cubic-bezier(0.2, 0.9, 0.25, 1),
            background-color 180ms ease,
            border-color 180ms ease,
            color 180ms ease,
            border-radius 180ms cubic-bezier(0.2, 0, 0, 1),
            box-shadow 180ms ease;
        }

        .room-card-single.is-active {
          border-radius: 28px;
          background: var(--md-sys-color-primary, var(--primary-color));
          color: var(--md-sys-color-on-primary, var(--text-primary-color, #fff));
          border-color: transparent;
          box-shadow: 0 14px 30px color-mix(in srgb, #000 18%, transparent);
        }

        .room-card-single.is-pressed {
          border-radius: 16px;
        }

        .room-card-single-slider {
          padding: 18px 18px 18px 16px;
          display: grid;
          gap: 16px;
          border-radius: 28px;
        }

        .room-slider-header {
          display: grid;
          gap: 4px;
          align-items: start;
        }

        .room-slider-wrap,
        .device-slider-wrap {
          min-width: 0;
        }

        .room-icon-shell,
        .device-icon-shell {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          border-radius: 18px;
          color: var(--lighting-on-surface);
          background: color-mix(in srgb, var(--lighting-surface-high) 86%, transparent);
          box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--lighting-outline) 80%, transparent);
        }

        .room-card.is-active .room-icon-shell,
        .room-card-single.is-active .room-icon-shell,
        .device-card.is-on .device-icon-shell {
          background: color-mix(in srgb, var(--lighting-surface) 42%, white 58%);
          color: color-mix(in srgb, var(--lighting-on-primary-container) 90%, black 10%);
        }

        .room-icon-shell {
          width: 48px;
          height: 48px;
        }

        .room-icon {
          --mdc-icon-size: 24px;
        }

        .room-copy,
        .device-copy {
          min-width: 0;
          display: grid;
          gap: 2px;
        }

        .room-title {
          font-size: 22px;
          line-height: 28px;
          font-weight: 400;
          letter-spacing: 0;
          overflow-wrap: anywhere;
        }

        .room-subtitle {
          font-size: 14px;
          line-height: 20px;
          font-weight: 400;
          color: var(--lighting-on-surface-variant);
        }

        .room-card-single.is-active .room-subtitle,
        .device-card.is-on .device-summary {
          color: color-mix(in srgb, var(--md-sys-color-on-primary, #fff) 82%, transparent);
        }

        .room-chevron {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: 40px;
          height: 40px;
          border-radius: 14px;
          color: var(--lighting-on-surface-variant);
          background: color-mix(in srgb, var(--lighting-surface-high) 72%, transparent);
          transition: transform 200ms cubic-bezier(0.2, 0, 0, 1);
        }

        .room-chevron.is-open {
          transform: rotate(180deg);
        }

        .room-body {
          display: grid;
          grid-template-rows: 0fr;
          transition: grid-template-rows 240ms cubic-bezier(0.2, 0, 0, 1);
        }

        .room-card.is-expanded .room-body {
          grid-template-rows: 1fr;
        }

        .room-body-inner {
          overflow: hidden;
        }

        .device-grid {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 12px;
          padding: 0 16px 16px;
        }

        .device-grid.single {
          grid-template-columns: 1fr;
        }

        .device-card {
          position: relative;
          display: grid;
          grid-template-columns: auto 1fr;
          gap: 12px;
          align-items: center;
          width: 100%;
          border: 1px solid color-mix(in srgb, var(--lighting-outline) 88%, transparent);
          border-radius: 999px;
          padding: 14px 14px 14px 12px;
          background: var(--md-sys-color-surface-container, color-mix(in srgb, var(--lighting-surface) 84%, white 16%));
          color: var(--md-sys-color-on-surface-variant, var(--lighting-on-surface-variant));
          cursor: pointer;
          text-align: left;
          font: inherit;
          transition:
            transform 180ms cubic-bezier(0.2, 0.9, 0.25, 1),
            background-color 180ms ease,
            border-color 180ms ease,
            color 180ms ease,
            border-radius 180ms cubic-bezier(0.2, 0, 0, 1),
            box-shadow 180ms ease;
        }

        .device-card.is-on {
          border-radius: 16px;
          background: var(--md-sys-color-primary, var(--primary-color));
          color: var(--md-sys-color-on-primary, var(--text-primary-color, #fff));
          border-color: transparent;
          box-shadow: 0 10px 20px color-mix(in srgb, #000 14%, transparent);
        }

        .device-card.is-pressed {
          border-radius: 12px;
        }

        .device-card-slider {
          display: grid;
          grid-template-columns: 1fr;
          gap: 14px;
          align-items: stretch;
          border-radius: 24px;
          padding: 14px;
          cursor: default;
        }

        .device-card-slider.is-on {
          border-radius: 24px;
          background:
            linear-gradient(
              135deg,
              color-mix(in srgb, var(--lighting-primary-container) 78%, var(--lighting-surface) 22%),
              color-mix(in srgb, var(--lighting-secondary-container) 64%, var(--lighting-surface) 36%)
            );
          color: var(--md-sys-color-on-surface, var(--lighting-on-surface));
          border-color: color-mix(in srgb, var(--lighting-primary-container) 68%, var(--lighting-outline));
          box-shadow: 0 10px 20px color-mix(in srgb, #000 14%, transparent);
        }

        .device-card-header {
          display: grid;
          gap: 4px;
          align-items: start;
          min-width: 0;
        }

        .device-icon-shell {
          width: 42px;
          height: 42px;
          border-radius: 16px;
        }

        .device-icon {
          --mdc-icon-size: 20px;
        }

        .device-name {
          font-size: 16px;
          line-height: 24px;
          font-weight: 500;
          letter-spacing: 0.009375rem;
          overflow-wrap: anywhere;
        }

        .device-summary {
          font-size: 14px;
          line-height: 20px;
          font-weight: 400;
          color: var(--lighting-on-surface-variant);
        }

        .is-unavailable {
          opacity: 0.62;
          filter: saturate(0.72);
        }

        @container (max-width: 560px) {
          .hero-title {
            font-size: 28px;
            line-height: 36px;
          }

          .room-title {
            font-size: 16px;
            line-height: 24px;
            font-weight: 500;
            letter-spacing: 0.009375rem;
          }
        }

        @container (max-width: 420px) {
          .dashboard-shell {
            padding-inline: 12px;
          }

          .room-card-single,
          .room-main {
            padding: 16px 16px 16px 14px;
            gap: 12px;
          }

          .room-icon-shell {
            width: 44px;
            height: 44px;
          }

          .room-card-single-slider {
            padding: 16px 16px 16px 14px;
            gap: 14px;
          }

          .device-grid {
            grid-template-columns: 1fr;
          }
        }
      </style>
      <ha-card>
        <div class="dashboard-shell">
          <div class="dashboard-content">
            <header class="hero">
              <h1 class="hero-title">${this._escape(this._config.title)}</h1>
              <p class="hero-subtitle">${
                this._config.subtitle
                  ? this._escape(this._config.subtitle)
                  : this._escape(this._dashboardSummary())
              }</p>
            </header>
            <div class="master-controls" role="group" aria-label="Global lighting controls">
              <button
                type="button"
                class="master-button ${globalState === "all-on" ? "is-selected" : ""}"
                data-action="turn-all-on"
                data-ui-key="master:on"
                aria-pressed="${globalState === "all-on" ? "true" : "false"}"
              >
                On
              </button>
              <button
                type="button"
                class="master-button ${globalState === "all-off" ? "is-selected" : ""}"
                data-action="turn-all-off"
                data-ui-key="master:off"
                aria-pressed="${globalState === "all-off" ? "true" : "false"}"
              >
                Off
              </button>
            </div>
            <div class="room-list">
              ${areasMarkup}
            </div>
          </div>
        </div>
      </ha-card>
    `;

    this._syncEmbeddedSliders();
    this._syncInteractionClasses();
  }
}

const ExistingM3LightingDashboard = customElements.get("m3-lighting-dashboard");
if (ExistingM3LightingDashboard) {
  const sourceProto = M3LightingDashboard.prototype;
  const targetProto = ExistingM3LightingDashboard.prototype;
  for (const name of Object.getOwnPropertyNames(sourceProto)) {
    if (name === "constructor") {
      continue;
    }
    Object.defineProperty(
      targetProto,
      name,
      Object.getOwnPropertyDescriptor(sourceProto, name)
    );
  }
  ExistingM3LightingDashboard.getStubConfig = M3LightingDashboard.getStubConfig;
} else {
  customElements.define("m3-lighting-dashboard", M3LightingDashboard);
}

window.customCards = window.customCards || [];
if (!window.customCards.find((card) => card.type === "m3-lighting-dashboard")) {
  window.customCards.push({
    type: "m3-lighting-dashboard",
    name: "M3 Lighting Dashboard",
    description: "Lighting dashboard card that depends on M3 Core Cards",
  });
}
