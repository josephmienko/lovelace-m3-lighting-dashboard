import { describe, expect, it, vi } from "vitest";

const dashboardModule = import("../src/m3-lighting-dashboard.js");

const baseConfig = {
  title: "Lighting",
  areas: [
    {
      title: "Kitchen",
      entities: [
        { entity: "light.kitchen_main", name: "Kitchen Main" },
        { entity: "switch.kitchen_fan", name: "Kitchen Fan" },
      ],
    },
  ],
};

const baseHass = () => ({
  states: {
    "light.kitchen_main": {
      entity_id: "light.kitchen_main",
      state: "on",
      attributes: {
        brightness: 128,
        supported_color_modes: ["brightness"],
        friendly_name: "Kitchen Main",
      },
    },
    "switch.kitchen_fan": {
      entity_id: "switch.kitchen_fan",
      state: "off",
      attributes: {
        friendly_name: "Kitchen Fan",
      },
    },
  },
  callService: vi.fn().mockResolvedValue(undefined),
});

const flushAsyncWork = () => new Promise((resolve) => window.setTimeout(resolve, 0));

function defineStubSlider() {
  if (customElements.get("m3-slider")) {
    return;
  }

  class StubM3Slider extends HTMLElement {
    constructor() {
      super();
      this.attachShadow({ mode: "open" });
      this.shadowRoot.innerHTML = `<div class="stub-slider"></div>`;
      this.hassAssignments = [];
    }

    set hass(value) {
      this._hass = value;
      this.hassAssignments.push(value);
    }

    get hass() {
      return this._hass;
    }
  }

  customElements.define("m3-slider", StubM3Slider);
}

describe("m3-lighting-dashboard", () => {
  it("renders a dependency warning when m3-slider is unavailable", async () => {
    await dashboardModule;

    const dashboard = document.createElement("m3-lighting-dashboard");
    dashboard.setConfig(baseConfig);
    document.body.appendChild(dashboard);

    expect(customElements.get("m3-lighting-dashboard")).toBeTypeOf("function");
    const cardTypes = new Set((window.customCards || []).map((card) => card.type));
    expect(cardTypes.has("m3-lighting-dashboard")).toBe(true);

    expect(dashboard.shadowRoot.textContent).toContain("Missing dependency: lovelace-m3-core-cards");
    expect(dashboard.shadowRoot.textContent).toContain("/hacsfiles/lovelace-m3-core-cards/lovelace-m3-core-cards.js");
  });

  it("renders embedded sliders and forwards hass once the core-cards dependency is present", async () => {
    await dashboardModule;
    defineStubSlider();

    const dashboard = document.createElement("m3-lighting-dashboard");
    const hass = baseHass();
    dashboard.setConfig(baseConfig);
    document.body.appendChild(dashboard);
    dashboard.hass = hass;

    const heroTitle = dashboard.shadowRoot.querySelector(".hero-title");
    expect(heroTitle?.textContent).toBe("Lighting");

    const sliders = [...dashboard.shadowRoot.querySelectorAll("m3-slider")];
    expect(sliders).toHaveLength(1);
    expect(sliders[0].getAttribute("entity")).toBe("light.kitchen_main");
    expect(sliders[0].getAttribute("aria-label")).toBe("Kitchen Main");
    expect(sliders[0].hass).toBe(hass);
  });

  it("calls the expected Home Assistant services from master and entity actions", async () => {
    await dashboardModule;
    defineStubSlider();

    const dashboard = document.createElement("m3-lighting-dashboard");
    const hass = baseHass();
    dashboard.setConfig(baseConfig);
    document.body.appendChild(dashboard);
    dashboard.hass = hass;

    const turnAllOnButton = dashboard.shadowRoot.querySelector('[data-action="turn-all-on"]');
    const toggleFanButton = dashboard.shadowRoot.querySelector('[data-action="toggle-entity"][data-entity="switch.kitchen_fan"]');

    turnAllOnButton.click();
    toggleFanButton.click();
    await flushAsyncWork();

    expect(hass.callService).toHaveBeenNthCalledWith(1, "homeassistant", "turn_on", {
      entity_id: ["light.kitchen_main", "switch.kitchen_fan"],
    });
    expect(hass.callService).toHaveBeenNthCalledWith(2, "homeassistant", "toggle", {
      entity_id: "switch.kitchen_fan",
    });
  });

  it("dispatches hass-more-info from entity context menus", async () => {
    await dashboardModule;
    defineStubSlider();

    const dashboard = document.createElement("m3-lighting-dashboard");
    const hass = baseHass();
    dashboard.setConfig(baseConfig);
    document.body.appendChild(dashboard);
    dashboard.hass = hass;

    const moreInfoSpy = vi.fn();
    dashboard.addEventListener("hass-more-info", moreInfoSpy);

    const sliderCard = dashboard.shadowRoot.querySelector('[data-entity="light.kitchen_main"]');
    sliderCard.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true }));

    expect(moreInfoSpy).toHaveBeenCalledTimes(1);
    expect(moreInfoSpy.mock.calls[0][0].detail).toEqual({ entityId: "light.kitchen_main" });
  });

  it("tracks slider interaction state and clears pending slider cooldown once hass catches up", async () => {
    await dashboardModule;
    defineStubSlider();

    const dashboard = document.createElement("m3-lighting-dashboard");
    const hass = baseHass();
    dashboard.setConfig(baseConfig);
    document.body.appendChild(dashboard);
    dashboard.hass = hass;

    dashboard.shadowRoot.dispatchEvent(
      new CustomEvent("m3-slider-interaction-start", {
        bubbles: true,
        composed: true,
        detail: { entityId: "light.kitchen_main" },
      })
    );

    dashboard.shadowRoot.dispatchEvent(
      new CustomEvent("m3-slider-interaction-end", {
        bubbles: true,
        composed: true,
        detail: { entityId: "light.kitchen_main", targetValue: 50 },
      })
    );

    expect(dashboard._slidingEntityIds.has("light.kitchen_main")).toBe(true);
    expect(dashboard._sliderPendingTargets.get("light.kitchen_main")).toBe(50);

    dashboard.hass = {
      ...hass,
      states: {
        ...hass.states,
        "light.kitchen_main": {
          ...hass.states["light.kitchen_main"],
          attributes: {
            ...hass.states["light.kitchen_main"].attributes,
            brightness: 128,
          },
        },
      },
    };

    expect(dashboard._slidingEntityIds.has("light.kitchen_main")).toBe(false);
    expect(dashboard._sliderPendingTargets.has("light.kitchen_main")).toBe(false);
  });
});
