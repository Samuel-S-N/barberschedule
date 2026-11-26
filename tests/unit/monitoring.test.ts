const mockInit = jest.fn();
const mockWrap = jest.fn((component: unknown) => component);

jest.mock("@sentry/react-native", () => ({ init: (...args: unknown[]) => mockInit(...args), wrap: (component: unknown) => mockWrap(component) }));

describe("monitoring", () => {
  const original = { ...process.env };
  const load = () => {
    let module!: typeof import("../../src/lib/monitoring/sentry");

    jest.isolateModules(() => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      module = require("../../src/lib/monitoring/sentry");
    });

    return module;
  };

  beforeEach(() => {
    mockInit.mockClear();
    mockWrap.mockClear();
    process.env = { ...original };
  });
  afterAll(() => {
    process.env = original;
  });

  it("does nothing without a DSN", () => {
    delete process.env.EXPO_PUBLIC_SENTRY_DSN;
    const { initMonitoring, withMonitoring } = load();
    const component = () => null;

    expect(initMonitoring()).toBe(false);
    expect(mockInit).not.toHaveBeenCalled();
    expect(withMonitoring(component)).toBe(component);
    expect(mockWrap).not.toHaveBeenCalled();
  });

  it("starts errors-only, without personal data, tagged with the environment", () => {
    process.env.EXPO_PUBLIC_SENTRY_DSN = "https://k@o1.ingest.de.sentry.io/2";
    process.env.EXPO_PUBLIC_APP_ENV = "production";
    const { initMonitoring } = load();

    expect(initMonitoring()).toBe(true);
    expect(mockInit).toHaveBeenCalledWith(expect.objectContaining({ dsn: "https://k@o1.ingest.de.sentry.io/2", environment: "production", sendDefaultPii: false, tracesSampleRate: 0 }));
    // The hooks are the scrubbing ones: an e-mail and the user never reach Sentry.
    const options = mockInit.mock.calls[0][0] as { beforeBreadcrumb: (crumb: unknown) => unknown; beforeSend: (event: unknown) => unknown };

    expect(options.beforeSend({ message: "a@b.co", user: { id: "u" } })).toEqual({ message: "[email]" });
    expect(options.beforeBreadcrumb({ message: "a@b.co" })).toEqual({ message: "[email]" });
  });

  it("defaults the environment to dev", () => {
    process.env.EXPO_PUBLIC_SENTRY_DSN = "https://k@o1.ingest.de.sentry.io/2";
    delete process.env.EXPO_PUBLIC_APP_ENV;
    load().initMonitoring();

    expect(mockInit).toHaveBeenCalledWith(expect.objectContaining({ environment: "dev" }));
  });

  it("wraps the root component only once started", () => {
    process.env.EXPO_PUBLIC_SENTRY_DSN = "https://k@o1.ingest.de.sentry.io/2";
    const { initMonitoring, withMonitoring } = load();
    const component = () => null;

    initMonitoring();
    withMonitoring(component);
    expect(mockWrap).toHaveBeenCalledWith(component);
  });
});
