import { describe, it, expect } from "vitest";
import { planProviderSync } from "../../src/lib/provider-url";

const provider = (
  key_name: string,
  endpoint_url: string | null,
  uuid = `uuid-${key_name}`
) => ({ uuid, key_name, endpoint_url });

const IP = "142.254.88.197";

describe("planProviderSync", () => {
  it("puts every provider in exactly one bucket", () => {
    const plan = planProviderSync(
      [
        provider("moves", "http://1.2.3.4:9000/v1"),
        provider("already", `http://${IP}:9000/v1`),
        provider("hostname", "http://home.example.com:9000/v1"),
        provider("no-url", null),
      ],
      IP
    );

    expect(plan.updated.map(u => u.key_name)).toEqual(["moves"]);
    expect(plan.unchanged.map(u => u.key_name)).toEqual(["already"]);
    expect(plan.skipped.map(s => s.key_name).sort()).toEqual([
      "hostname",
      "no-url",
    ]);
  });

  it("reports the before and after for an updated provider", () => {
    const plan = planProviderSync(
      [provider("moves", "http://1.2.3.4:9000/v1", "abc")],
      IP
    );

    expect(plan.updated[0]).toEqual({
      uuid: "abc",
      key_name: "moves",
      from: "http://1.2.3.4:9000/v1",
      to: `http://${IP}:9000/v1`,
    });
  });

  it("says why a provider was skipped", () => {
    const plan = planProviderSync(
      [
        provider("hostname", "http://home.example.com:9000/v1"),
        provider("no-url", null),
      ],
      IP
    );

    expect(plan.skipped.find(s => s.key_name === "hostname")!.reason).toContain(
      "hostname"
    );
    expect(plan.skipped.find(s => s.key_name === "no-url")!.reason).toContain(
      "not set"
    );
    expect(plan.skipped.find(s => s.key_name === "no-url")!.url).toBeNull();
  });

  it("plans nothing for an empty provider list", () => {
    expect(planProviderSync([], IP)).toEqual({
      updated: [],
      unchanged: [],
      skipped: [],
    });
  });

  it("is idempotent: replanning its own result changes nothing", () => {
    const first = planProviderSync(
      [provider("moves", "http://1.2.3.4:9000/v1")],
      IP
    );
    const second = planProviderSync(
      [provider("moves", first.updated[0]!.to)],
      IP
    );

    expect(second.updated).toEqual([]);
    expect(second.unchanged.map(u => u.key_name)).toEqual(["moves"]);
  });

  it("does not mutate the providers it was given", () => {
    const rows = [provider("moves", "http://1.2.3.4:9000/v1")];
    const snapshot = structuredClone(rows);
    planProviderSync(rows, IP);
    expect(rows).toEqual(snapshot);
  });
});
