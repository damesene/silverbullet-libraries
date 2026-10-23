import { describe, expect, it } from "vitest";
import { moduleHost } from "./modulehost.ts";

class Base {
  protected count = 1;
  get doubled(): number {
    return this.count * 2;
  }
  bump(): number {
    return ++this.count;
  }
}

class Core extends Base {
  later: (() => string) | undefined;
  name(): string {
    return "core";
  }
}

describe("moduleHost", () => {
  it("forwards the core's methods bound to it, its accessors and fields live", () => {
    const core = new Core();
    const host = moduleHost(core);
    const { bump } = host;
    expect(bump()).toBe(2);
    expect(host.doubled).toBe(4);
    expect(host.bump).toBe(host.bump);
    core.later = function (this: Core) {
      return this.name();
    };
    expect(host.later?.()).toBe("core");
    expect(host.later).toBe(host.later);
  });

  it("puts the module's own members in place of the core's", () => {
    const host = moduleHost(new Core(), { name: () => "module" });
    expect(host.name()).toBe("module");
    expect(host.doubled).toBe(2);
  });
});
