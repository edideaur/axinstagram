import { describe, expect, test } from "bun:test";
import {
  biggest,
  smallest,
  extractStoriesItems,
  extractFromGQL,
  reelItems,
} from "./instagram";

describe("biggest", () => {
  const cands = [
    { width: 150, height: 150, url: "small.jpg" },
    { width: 1080, height: 1920, url: "big.jpg" },
    { width: 640, height: 640, url: "mid.jpg" },
  ];
  test("returns the highest-area candidate url", () => {
    expect(biggest(cands)).toBe("big.jpg");
  });
  test("returns only candidate when array has one item", () => {
    expect(biggest([{ width: 320, height: 320, url: "only.jpg" }])).toBe(
      "only.jpg",
    );
  });
});

describe("smallest", () => {
  const cands = [
    { width: 150, height: 150, url: "small.jpg" },
    { width: 1080, height: 1920, url: "big.jpg" },
    { width: 640, height: 640, url: "mid.jpg" },
  ];
  test("returns the lowest-area candidate url", () => {
    expect(smallest(cands)).toBe("small.jpg");
  });
});

describe("extractStoriesItems", () => {
  test("photo item — thumb is smallest, full is biggest", () => {
    const items = [
      {
        image_versions2: {
          candidates: [
            { width: 1080, height: 1920, url: "big.jpg" },
            { width: 150, height: 150, url: "small.jpg" },
          ],
        },
      },
    ];
    const result = extractStoriesItems(items);
    expect(result.photos).toHaveLength(1);
    expect(result.photos![0].full).toBe("big.jpg");
    expect(result.photos![0].thumb).toBe("small.jpg");
    expect(result.photos![0].isVideo).toBeUndefined();
    expect(result.isPhoto).toBe(true);
  });

  test("video item — full is highest-res video, thumb from image candidates", () => {
    const items = [
      {
        image_versions2: {
          candidates: [{ width: 1080, height: 1920, url: "thumb.jpg" }],
        },
        video_versions: [
          { width: 720, height: 1280, url: "lo.mp4" },
          { width: 1080, height: 1920, url: "hi.mp4" },
        ],
      },
    ];
    const result = extractStoriesItems(items);
    expect(result.photos![0].full).toBe("hi.mp4");
    expect(result.photos![0].thumb).toBe("thumb.jpg");
    expect(result.photos![0].isVideo).toBe(true);
  });

  test("video item with no image candidates falls back to biggest video for thumb", () => {
    const items = [
      {
        image_versions2: { candidates: [] },
        video_versions: [
          { width: 720, height: 1280, url: "lo.mp4" },
          { width: 1080, height: 1920, url: "hi.mp4" },
        ],
      },
    ];
    const result = extractStoriesItems(items);
    expect(result.photos![0].thumb).toBe("hi.mp4");
    expect(result.photos![0].full).toBe("hi.mp4");
  });

  test("handles multiple items", () => {
    const items = [
      {
        image_versions2: {
          candidates: [{ width: 100, height: 100, url: "a.jpg" }],
        },
      },
      {
        image_versions2: {
          candidates: [{ width: 200, height: 200, url: "b.jpg" }],
        },
      },
    ];
    expect(extractStoriesItems(items).photos).toHaveLength(2);
  });
});

describe("extractFromGQL", () => {
  test("returns null for empty data", () => {
    expect(extractFromGQL({}, "abc")).toBeNull();
  });

  test("handles shortcode_media key", () => {
    const data = {
      gql_data: { shortcode_media: { video_url: "https://cdn/v.mp4" } },
    };
    expect(extractFromGQL(data, "abc")!.videoUrl).toBe("https://cdn/v.mp4");
  });

  test("handles xdt_shortcode_media key", () => {
    const data = {
      gql_data: { xdt_shortcode_media: { video_url: "https://cdn/v.mp4" } },
    };
    expect(extractFromGQL(data, "abc")!.videoUrl).toBe("https://cdn/v.mp4");
  });

  test("single image post — videoUrl is display_url, isPhoto is true", () => {
    const data = {
      gql_data: { shortcode_media: { display_url: "https://cdn/img.jpg" } },
    };
    const result = extractFromGQL(data, "abc")!;
    expect(result.videoUrl).toBe("https://cdn/img.jpg");
    expect(result.isPhoto).toBe(true);
  });

  test("sidecar — returns photos array", () => {
    const data = {
      gql_data: {
        shortcode_media: {
          edge_sidecar_to_children: {
            edges: [
              { node: { display_url: "https://cdn/img1.jpg" } },
              {
                node: {
                  display_url: "https://cdn/poster.jpg",
                  video_url: "https://cdn/vid.mp4",
                },
              },
            ],
          },
        },
      },
    };
    const result = extractFromGQL(data, "abc")!;
    expect(result.photos).toHaveLength(2);
    expect(result.photos![0].full).toBe("https://cdn/img1.jpg");
    expect(result.photos![0].isVideo).toBeUndefined();
    expect(result.photos![1].full).toBe("https://cdn/vid.mp4");
    expect(result.photos![1].isVideo).toBe(true);
    expect(result.isPhoto).toBe(true);
  });

  test("sidecar filters out nodes with no display or video url", () => {
    const data = {
      gql_data: {
        shortcode_media: {
          edge_sidecar_to_children: {
            edges: [
              { node: { display_url: "https://cdn/img.jpg" } },
              { node: {} },
            ],
          },
        },
      },
    };
    const result = extractFromGQL(data, "abc")!;
    expect(result.photos).toHaveLength(1);
  });
});

describe("reelItems", () => {
  const mockItems = [{ image_versions2: { candidates: [] } }];

  test("GQL shape: data.reels_media[0].items", () => {
    const json = { data: { reels_media: [{ items: mockItems }] } };
    expect(reelItems(json)).toBe(mockItems);
  });

  test("mobile shape: reels_media[0].items (no data wrapper)", () => {
    const json = { reels_media: [{ items: mockItems }] };
    expect(reelItems(json)).toBe(mockItems);
  });

  test("GQL shape takes precedence over mobile shape", () => {
    const gqlItems = [{ a: 1 }];
    const mobileItems = [{ b: 2 }];
    const json = {
      data: { reels_media: [{ items: gqlItems }] },
      reels_media: [{ items: mobileItems }],
    };
    expect(reelItems(json)).toBe(gqlItems);
  });

  test("returns undefined for null input", () => {
    expect(reelItems(null)).toBeUndefined();
  });

  test("returns undefined when reels_media is missing", () => {
    expect(reelItems({ data: {} })).toBeUndefined();
  });

  test("returns undefined when items is missing from reel", () => {
    const json = { data: { reels_media: [{}] } };
    expect(reelItems(json)).toBeUndefined();
  });
});
