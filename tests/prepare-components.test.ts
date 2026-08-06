import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  DEFAULT_TITLE_FONT_SIZE,
  LIFECYCLE_COLORS,
  createPreview,
  elementBounds,
  generateComponents,
  layoutTokens,
  loadCatalog,
  resolveService,
  validateGeneratedOutput,
} from "../plugins/excalidraw-agent-design-tools/skills/excalidraw-system-design/scripts/prepare-components.ts";

const catalog = loadCatalog();

function baseComponent(overrides: Record<string, unknown> = {}) {
  return {
    id: "order-handler",
    service: "lambda",
    title: "Order handler",
    status: "new",
    x: 400,
    y: 200,
    titleFontSize: DEFAULT_TITLE_FONT_SIZE,
    layout: "vertical",
    ...overrides,
  };
}

function oneComponent(overrides: Record<string, unknown> = {}, greenfield = false) {
  const component = baseComponent(overrides);
  const output = generateComponents({ greenfield, components: [component] }, { catalog });
  const boxTempId = output.componentTargets[component.id as string];
  const box = output.elements.find((element) => element.tempId === boxTempId)!;
  const title = output.elements.find(
    (element) => element.type === "text" && element.text === component.title && element.fontFamily === 5,
  )!;
  const artwork = output.elements.filter(
    (element) => element.tempId !== box.tempId && element.tempId !== title.tempId,
  );
  return { component, output, box, title, artwork };
}

function unionBounds(elements: Record<string, any>[]) {
  const bounds = elements.map(elementBounds);
  const minX = Math.min(...bounds.map((value) => value.minX));
  const minY = Math.min(...bounds.map((value) => value.minY));
  const maxX = Math.max(...bounds.map((value) => value.maxX));
  const maxY = Math.max(...bounds.map((value) => value.maxY));
  return { minX, minY, maxX, maxY, width: maxX - minX, height: maxY - minY };
}

function overlaps(a: ReturnType<typeof elementBounds>, b: ReturnType<typeof elementBounds>) {
  return a.minX < b.maxX && a.maxX > b.minX && a.minY < b.maxY && a.maxY > b.minY;
}

function assertInsideBox(
  box: Record<string, any>,
  content: ReturnType<typeof unionBounds>,
  horizontalPadding: number,
  verticalPadding: number,
) {
  assert.ok(content.minX >= box.x + horizontalPadding - 0.01);
  assert.ok(content.maxX <= box.x + box.width - horizontalPadding + 0.01);
  assert.ok(content.minY >= box.y + verticalPadding - 0.01);
  assert.ok(content.maxY <= box.y + box.height - verticalPadding + 0.01);
}

function hash(path: string) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function normalizeIdentifiers(output: Record<string, any>) {
  const clone = structuredClone(output);
  const tempIds = new Map<string, string>();
  const groupIds = new Map<string, string>();
  for (const [index, element] of clone.elements.entries()) {
    tempIds.set(element.tempId, `temp-${index}`);
    for (const groupId of element.groupIds) {
      if (!groupIds.has(groupId)) {
        groupIds.set(groupId, `group-${groupIds.size}`);
      }
    }
  }
  for (const element of clone.elements) {
    element.tempId = tempIds.get(element.tempId);
    element.groupIds = element.groupIds.map((groupId: string) => groupIds.get(groupId));
    for (const field of ["containerId", "frameId"]) {
      if (typeof element[field] === "string") {
        element[field] = tempIds.get(element[field]);
      }
    }
    for (const field of ["startBinding", "endBinding"]) {
      if (element[field]?.elementId) {
        element[field].elementId = tempIds.get(element[field].elementId);
      }
    }
  }
  for (const key of Object.keys(clone.componentTargets)) {
    clone.componentTargets[key] = tempIds.get(clone.componentTargets[key]);
  }
  return clone;
}

test("resolves canonical service names and aliases", () => {
  assert.equal(resolveService(catalog, "AWS Lambda").service, "AWS Lambda");
  assert.equal(resolveService(catalog, "lambda").service, "AWS Lambda");
  assert.equal(resolveService(catalog, "cloud-watch").service, "Amazon CloudWatch");
});

test("all catalog paths exist and load as artwork", () => {
  assert.equal(catalog.entries.length, 16);
  for (const entry of catalog.entries) {
    assert.ok(existsSync(entry.assetPath), entry.assetPath);
    assert.ok(entry.elements.length > 0, entry.service);
    assert.ok(entry.artworkBounds.width > 0);
    assert.ok(entry.artworkBounds.height > 0);
  }
});

test("duplicate icon instances receive unique tempIds and group IDs", () => {
  const output = generateComponents(
    {
      components: [
        baseComponent({ id: "lambda-a", x: 0, y: 0 }),
        baseComponent({ id: "lambda-b", x: 500, y: 0 }),
      ],
    },
    { catalog },
  );
  const tempIds = output.elements.map((element) => element.tempId);
  assert.equal(new Set(tempIds).size, tempIds.length);

  const firstGroup = output.elements.find(
    (element) => element.tempId === output.componentTargets["lambda-a"],
  )!.groupIds[0];
  const secondGroup = output.elements.find(
    (element) => element.tempId === output.componentTargets["lambda-b"],
  )!.groupIds[0];
  assert.notEqual(firstGroup, secondGroup);
  const firstGroups = new Set(
    output.elements
      .filter((element) => element.groupIds.includes(firstGroup))
      .flatMap((element) => element.groupIds),
  );
  const secondGroups = new Set(
    output.elements
      .filter((element) => element.groupIds.includes(secondGroup))
      .flatMap((element) => element.groupIds),
  );
  assert.deepEqual([...firstGroups].filter((id) => secondGroups.has(id)), []);
});

test("internal artwork references are remapped to generated tempIds", () => {
  const { output, artwork, box } = oneComponent({ service: "vtl resolver" });
  const sourceIds = new Set(resolveService(catalog, "vtl resolver").elements.map((element) => element.id));
  const generatedIds = new Set(output.elements.map((element) => element.tempId));
  const arrows = artwork.filter((element) => element.type === "arrow");
  assert.ok(arrows.length > 0);
  let referenceCount = 0;
  for (const arrow of arrows) {
    for (const binding of [arrow.startBinding, arrow.endBinding]) {
      if (!binding) continue;
      referenceCount += 1;
      assert.ok(generatedIds.has(binding.elementId));
      assert.ok(!sourceIds.has(binding.elementId));
      assert.notEqual(binding.elementId, box.tempId);
    }
  }
  assert.ok(referenceCount > 0);
});

test("generation does not mutate source assets", () => {
  const before = new Map(catalog.entries.map((entry) => [entry.assetPath, hash(entry.assetPath)]));
  createPreview({ catalog });
  for (const entry of catalog.entries) {
    assert.equal(hash(entry.assetPath), before.get(entry.assetPath), entry.assetPath);
  }
});

test("default architectural titles have stronger hierarchy than every service label", () => {
  for (const entry of catalog.entries) {
    const { artwork, title } = oneComponent({
      service: entry.service,
      titleFontSize: undefined,
    });
    const serviceLabel = artwork
      .filter((element) => element.type === "text")
      .toSorted((left, right) => elementBounds(right).maxY - elementBounds(left).maxY)[0];
    assert.ok(serviceLabel, entry.service);
    assert.equal(title.fontSize, DEFAULT_TITLE_FONT_SIZE);
    assert.ok(
      title.fontSize >= serviceLabel.fontSize * 1.5,
      `${entry.service}: ${title.fontSize}px title versus ${serviceLabel.fontSize}px service label`,
    );
  }
});

test("vertical layout puts complete artwork above an independent title without overlap", () => {
  const { box, title, artwork } = oneComponent();
  const artBounds = unionBounds(artwork);
  const titleBounds = elementBounds(title);
  const tokens = layoutTokens(DEFAULT_TITLE_FONT_SIZE);
  assert.ok(artBounds.maxY < titleBounds.minY);
  assert.ok(!overlaps(artBounds, titleBounds));
  assertInsideBox(box, artBounds, tokens.horizontalPadding, tokens.verticalPadding);
  assertInsideBox(box, titleBounds, tokens.horizontalPadding, tokens.verticalPadding);
});

test("horizontal layout puts complete artwork left of the title without overlap", () => {
  const { box, title, artwork } = oneComponent({ layout: "horizontal" });
  const artBounds = unionBounds(artwork);
  const titleBounds = elementBounds(title);
  const tokens = layoutTokens(DEFAULT_TITLE_FONT_SIZE);
  assert.ok(artBounds.maxX < titleBounds.minX);
  assert.ok(!overlaps(artBounds, titleBounds));
  assertInsideBox(box, artBounds, tokens.horizontalPadding, tokens.verticalPadding);
  assertInsideBox(box, titleBounds, tokens.horizontalPadding, tokens.verticalPadding);
});

test("artwork aspect ratio is preserved at the title-derived scale", () => {
  const { artwork } = oneComponent({ service: "api gateway", titleFontSize: 24 });
  const generated = unionBounds(artwork);
  const source = resolveService(catalog, "api gateway").artworkBounds;
  assert.ok(Math.abs(generated.width / generated.height - source.width / source.height) < 0.0001);
});

test("architectural title is unbound and artwork never binds to the component box", () => {
  const { title, artwork, box } = oneComponent({ service: "vtl resolver" });
  assert.equal(title.containerId, null);
  assert.equal(title.type, "text");
  assert.ok(!("label" in box));
  assert.ok(!box.boundElements || box.boundElements.length === 0);
  for (const element of artwork) {
    assert.notEqual(element.containerId, box.tempId);
    assert.notEqual(element.frameId, box.tempId);
    assert.notEqual(element.startBinding?.elementId, box.tempId);
    assert.notEqual(element.endBinding?.elementId, box.tempId);
    assert.ok(!("boundElements" in element));
  }
});

test("width and height overrides expand the component and preserve centered content", () => {
  const defaults = oneComponent({ layout: "horizontal" });
  const overridden = oneComponent({
    layout: "horizontal",
    width: defaults.box.width + 140,
    height: defaults.box.height + 90,
  });
  assert.equal(overridden.box.width, defaults.box.width + 140);
  assert.equal(overridden.box.height, defaults.box.height + 90);
  assertInsideBox(
    overridden.box,
    unionBounds(overridden.artwork),
    layoutTokens(DEFAULT_TITLE_FONT_SIZE).horizontalPadding,
    layoutTokens(DEFAULT_TITLE_FONT_SIZE).verticalPadding,
  );
  assertInsideBox(
    overridden.box,
    elementBounds(overridden.title),
    layoutTokens(DEFAULT_TITLE_FONT_SIZE).horizontalPadding,
    layoutTokens(DEFAULT_TITLE_FONT_SIZE).verticalPadding,
  );
});

test("overrides that cannot contain content are rejected clearly", () => {
  const vertical = oneComponent();
  assert.throws(
    () => oneComponent({ width: vertical.box.width - 1 }),
    /width .* too small.*minimum/i,
  );
  assert.throws(
    () => oneComponent({ height: vertical.box.height - 1 }),
    /height .* too small.*minimum/i,
  );
});

test("greenfield mode forces black outlines", () => {
  assert.equal(oneComponent({ status: "new" }, true).box.strokeColor, LIFECYCLE_COLORS.existing);
  assert.equal(oneComponent({ status: "removed" }, true).box.strokeColor, LIFECYCLE_COLORS.existing);
});

test("lifecycle colour affects only the outer box", () => {
  for (const status of ["existing", "changed", "new", "removed"] as const) {
    const { box, title, artwork } = oneComponent({ status });
    const source = resolveService(catalog, "lambda").elements;
    assert.equal(box.strokeColor, LIFECYCLE_COLORS[status]);
    assert.equal(title.strokeColor, "#1e1e1e");
    assert.deepEqual(
      artwork.map((element) => element.strokeColor),
      source.map((element) => element.strokeColor),
    );
  }
});

test("duplicate logical component IDs are rejected", () => {
  assert.throws(
    () =>
      generateComponents(
        { components: [baseComponent(), baseComponent({ service: "s3" })] },
        { catalog },
      ),
    /duplicate component id "order-handler"/,
  );
});

test("unknown services, layouts, statuses, and malformed inputs fail clearly", () => {
  const invalidCases: Array<[unknown, RegExp]> = [
    [{ components: [baseComponent({ service: "made-up cloud" })] }, /unknown AWS service/],
    [{ components: [baseComponent({ layout: "diagonal" })] }, /layout must be one of/],
    [{ components: [baseComponent({ status: "pending" })] }, /status must be one of/],
    [{ components: [baseComponent({ x: "left" })] }, /\.x must be a finite number/],
    [{ components: [baseComponent({ titleFontSize: 10 })] }, /at least 14/],
    [{ components: [baseComponent({ width: 0 })] }, /width must be greater than zero/],
    [{ components: [baseComponent({ title: "line one\nline two" })] }, /single line/],
    [{ greenfield: "yes", components: [] }, /greenfield must be a boolean/],
    [{ components: {} }, /components must be an array/],
  ];
  for (const [input, expected] of invalidCases) {
    assert.throws(() => generateComponents(input, { catalog }), expected);
  }
});

test("malformed TSV rows and missing assets fail clearly", () => {
  const directory = mkdtempSync(join(tmpdir(), "aws-components-test-"));
  try {
    const malformed = join(directory, "malformed.tsv");
    writeFileSync(malformed, "service\taliases\tpath\nAWS Lambda\tlambda\n", "utf8");
    assert.throws(() => loadCatalog(malformed), /exactly 3 tab-separated columns/);

    const missing = join(directory, "missing.tsv");
    writeFileSync(
      missing,
      "service\taliases\tpath\nAWS Lambda\tlambda\tmissing.excalidraw.json\n",
      "utf8",
    );
    assert.throws(() => loadCatalog(missing), /AWS icon asset is missing/);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("output contains skeleton tempIds but no persisted or stale reconciliation fields", () => {
  const output = generateComponents(
    {
      components: [
        baseComponent({ id: "one" }),
        baseComponent({ id: "two", service: "vtl resolver", x: 900 }),
      ],
    },
    { catalog },
  );
  validateGeneratedOutput(output);
  const stale = ["id", "version", "versionNonce", "index", "updated", "boundElements", "isDeleted"];
  for (const element of output.elements) {
    assert.equal(typeof element.tempId, "string");
    for (const field of stale) {
      assert.ok(!(field in element), `${element.tempId} contains ${field}`);
    }
  }
});

test("every componentTarget refers to its generated outer box tempId", () => {
  const output = generateComponents(
    {
      components: [
        baseComponent({ id: "one" }),
        baseComponent({ id: "two", service: "s3", x: 800 }),
      ],
    },
    { catalog },
  );
  for (const target of Object.values(output.componentTargets)) {
    const element = output.elements.find((candidate) => candidate.tempId === target);
    assert.equal(element?.type, "rectangle");
    assert.ok(!("label" in element!));
  }
});

test("generation is deterministic after intentionally fresh identifiers are normalized", () => {
  const input = {
    greenfield: false,
    components: [
      baseComponent({ id: "vertical" }),
      baseComponent({ id: "horizontal", service: "s3", x: 900, layout: "horizontal" }),
    ],
  };
  const first = generateComponents(input, { catalog });
  const second = generateComponents(input, { catalog });
  assert.notDeepEqual(
    first.elements.map((element) => element.tempId),
    second.elements.map((element) => element.tempId),
  );
  assert.deepEqual(normalizeIdentifiers(first), normalizeIdentifiers(second));
});

test("preview exercises every vertical icon plus horizontal, duplicate, override, and greenfield cases", () => {
  const output = createPreview({ catalog });
  assert.equal(
    Object.keys(output.componentTargets).filter((id) => id.startsWith("vertical-")).length,
    catalog.entries.length,
  );
  assert.equal(Object.keys(output.componentTargets).filter((id) => id.startsWith("horizontal-")).length, 4);
  assert.ok(output.componentTargets["greenfield-new"]);
  assert.ok(output.componentTargets["greenfield-removed"]);
  for (const id of ["greenfield-new", "greenfield-removed"]) {
    const box = output.elements.find((element) => element.tempId === output.componentTargets[id]);
    assert.equal(box?.strokeColor, LIFECYCLE_COLORS.existing);
  }
  const boxes = Object.values(output.componentTargets).map((target) =>
    output.elements.find((element) => element.tempId === target)!,
  );
  for (let left = 0; left < boxes.length; left += 1) {
    for (let right = left + 1; right < boxes.length; right += 1) {
      assert.ok(
        !overlaps(elementBounds(boxes[left]), elementBounds(boxes[right])),
        `preview boxes ${boxes[left].tempId} and ${boxes[right].tempId} overlap`,
      );
    }
  }
  validateGeneratedOutput(output);
});
