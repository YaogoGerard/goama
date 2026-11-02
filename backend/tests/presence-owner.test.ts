import { describe, expect, it } from "vitest";
import { possedePresenceCourante } from "../src/messaging/presence-owner.js";

describe("propriétaire de présence WebSocket", () => {
  it("conserve la socket dont l'instance et la session sont toujours propriétaires", () => {
    expect(possedePresenceCourante(
      { instanceId: "instance-b", sessionId: "session-b" },
      "instance-b",
      "session-b",
    )).toBe(true);
  });

  it("détecte une socket déplacée vers une autre instance", () => {
    expect(possedePresenceCourante(
      { instanceId: "instance-b", sessionId: "session-b" },
      "instance-a",
      "session-a",
    )).toBe(false);
  });

  it("détecte une nouvelle session sur la même instance", () => {
    expect(possedePresenceCourante(
      { instanceId: "instance-a", sessionId: "session-b" },
      "instance-a",
      "session-a",
    )).toBe(false);
  });

  it("ferme en absence de présence durable", () => {
    expect(possedePresenceCourante(null, "instance-a", "session-a")).toBe(false);
  });
});
