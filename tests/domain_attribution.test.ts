import { jest } from "@jest/globals";
import { Crawler } from "../src/crawler";

describe("domain attribution", () => {
  test("attributes non-seed domains to the originating seed and preserves original seed domains", () => {
    const crawler = Object.create(Crawler.prototype) as Crawler;

    crawler.originalSeedDomains = new Set(["test.at", "foo.bar"]);
    crawler.seedAttributedDomains = new Map([
      [0, "test.at"],
      [1, "foo.bar"],
    ]);

    expect(crawler.getAttributedDomain("https://cdn.example.org/app.js", 0)).toBe(
      "test.at",
    );

    expect(crawler.getAttributedDomain("https://www.foo.bar/page", 0)).toBe(
      "foo.bar",
    );

    crawler.registerAttributedDomainForRedirectSeed(2, 0);

    expect(
      crawler.getAttributedDomain("https://redirect-target.example.org/", 2),
    ).toBe("test.at");
  });

  test("keeps the originating seedId when discovered links are queued", async () => {
    const crawler = Object.create(Crawler.prototype) as any;

    const getScope = jest
      .fn()
      .mockReturnValueOnce({
        url: "https://cdn.example.org/embed",
        isOOS: false,
      })
      .mockReturnValueOnce({
        url: "https://www.foo.bar/page",
        isOOS: true,
      });
    const queueUrl = jest.fn(async () => true);
    const writeSkippedPage = jest.fn();

    crawler.getScope = getScope;
    crawler.queueUrl = queueUrl;
    crawler.writeSkippedPage = writeSkippedPage;

    await crawler.queueInScopeUrls(
      7,
      ["https://cdn.example.org/embed", "https://www.foo.bar/page"],
      2,
      1,
    );

    expect(queueUrl).toHaveBeenNthCalledWith(
      1,
      7,
      "https://cdn.example.org/embed",
      3,
      1,
      {},
    );
    expect(queueUrl).toHaveBeenNthCalledWith(
      2,
      7,
      "https://www.foo.bar/page",
      3,
      2,
      {},
    );
    expect(writeSkippedPage).not.toHaveBeenCalled();
  });

  test("adds completeness states to domain stats only for the opt-in depth-0 domain-scope mode", () => {
    const crawler = Object.create(Crawler.prototype) as any;

    crawler.params = {
      domainStatsCompleteness: true,
      scopeType: "domain",
      depth: 0,
    };
    crawler.domainCompletenessIncomplete = new Set(["large.example"]);
    crawler.domainCompletenessUnknown = new Set(["unclear.example"]);
    crawler.domainCompletenessComplete = new Set(["small.example"]);

    expect(
      crawler.addDomainCompletenessToStats([
        {
          domain: "large.example",
          bytes: 10,
          objects: 1,
          limitReached: false,
        },
        {
          domain: "small.example",
          bytes: 5,
          objects: 1,
          limitReached: false,
        },
        {
          domain: "unclear.example",
          bytes: 0,
          objects: 0,
          limitReached: false,
        },
      ]),
    ).toEqual([
      {
        domain: "large.example",
        bytes: 10,
        objects: 1,
        limitReached: false,
        completeness: "incomplete",
      },
      {
        domain: "small.example",
        bytes: 5,
        objects: 1,
        limitReached: false,
        completeness: "complete",
      },
      {
        domain: "unclear.example",
        bytes: 0,
        objects: 0,
        limitReached: false,
        completeness: "unknown",
      },
    ]);
  });

  test("probes additional depth-1 candidates without queueing them", async () => {
    const crawler = Object.create(Crawler.prototype) as any;

    crawler.params = {
      domainStatsCompleteness: true,
      scopeType: "domain",
      depth: 0,
    };
    crawler.domainCompletenessIncomplete = new Set();
    crawler.domainCompletenessUnknown = new Set();
    crawler.domainCompletenessComplete = new Set();
    crawler.getAttributedDomain = jest.fn().mockReturnValue("seed.example");
    crawler.getScope = jest
      .fn()
      .mockReturnValueOnce({
        url: "https://seed.example/about",
        isOOS: false,
      })
      .mockReturnValueOnce(false);
    crawler.runLinkExtraction = jest.fn(async (_frames, _selectors, _logDetails) => {
      await data.callbacks.addLink("https://seed.example/about");
      await data.callbacks.addLink("https://offscope.example/");
      return { hadErrors: false };
    });

    const data: any = {
      url: "https://seed.example/",
      seedId: 0,
      depth: 0,
      extraHops: 0,
      filteredFrames: [],
      callbacks: {},
    };

    await crawler.probeDomainStatsCompleteness(
      {} as any,
      data,
      [],
      {},
    );

    expect(crawler.getScope).toHaveBeenNthCalledWith(
      1,
      {
        url: "https://seed.example/about",
        extraHops: 1,
        depth: 1,
        seedId: 0,
        noOOS: false,
      },
      {},
    );
    expect(crawler.domainCompletenessIncomplete.has("seed.example")).toBe(true);
    expect(crawler.domainCompletenessComplete.has("seed.example")).toBe(false);
  });

  test("marks completeness as unknown when the probe encounters link extraction errors", async () => {
    const crawler = Object.create(Crawler.prototype) as any;

    crawler.params = {
      domainStatsCompleteness: true,
      scopeType: "domain",
      depth: 0,
    };
    crawler.domainCompletenessIncomplete = new Set();
    crawler.domainCompletenessUnknown = new Set();
    crawler.domainCompletenessComplete = new Set();
    crawler.getAttributedDomain = jest.fn().mockReturnValue("seed.example");
    crawler.runLinkExtraction = jest.fn(async () => ({ hadErrors: true }));

    const data: any = {
      url: "https://seed.example/",
      seedId: 0,
      depth: 0,
      extraHops: 0,
      filteredFrames: [],
      callbacks: {},
    };

    await crawler.probeDomainStatsCompleteness(
      {} as any,
      data,
      [],
      {},
    );

    expect(crawler.domainCompletenessUnknown.has("seed.example")).toBe(true);
    expect(crawler.domainCompletenessComplete.has("seed.example")).toBe(false);
    expect(crawler.domainCompletenessIncomplete.has("seed.example")).toBe(
      false,
    );
  });
});
