import { afterEach, describe, expect, it, vi } from "vitest";
import { toPresence } from "./presence.ts";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("toPresence", () => {
  it("maps Steam's persona states to the three states the UI cares about", () => {
    // Steam has six states; the roster only distinguishes offline, online and
    // in-game, so away/busy/snooze all collapse to "online".
    expect(toPresence({ personastate: 0 }).status).toBe("offline");
    expect(toPresence({ personastate: 1 }).status).toBe("online");
    expect(toPresence({ personastate: 2 }).status).toBe("online");
    expect(toPresence({ personastate: 3 }).status).toBe("online");
    expect(toPresence({ personastate: 4 }).status).toBe("online");
    expect(toPresence({ personastate: 5 }).status).toBe("online");
  });

  it("reports in-game when Steam names the game, whatever the persona state", () => {
    const p = toPresence({ personastate: 1, gameextrainfo: "Counter-Strike 2" });
    expect(p).toEqual({ status: "in-game", game: "Counter-Strike 2" });
  });

  it("carries no game name unless one is playing", () => {
    expect(toPresence({ personastate: 1 })).toEqual({ status: "online", game: null });
  });

  it("treats a private profile as offline rather than guessing", () => {
    // communityvisibilitystate 1 = private: personastate is meaningless there.
    expect(toPresence({ personastate: 1, communityvisibilitystate: 1 }).status).toBe("offline");
  });

  it("treats an unknown persona state as offline", () => {
    expect(toPresence({ personastate: 99 }).status).toBe("offline");
  });
});
