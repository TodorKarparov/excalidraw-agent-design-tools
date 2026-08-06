#!/usr/bin/env node

import { randomUUID } from "node:crypto";
import {
  existsSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

type JsonObject = Record<string, any>;
type Layout = "vertical" | "horizontal";
type Status = "existing" | "changed" | "new" | "removed";

export type ComponentInput = {
  id: string;
  service: string;
  title: string;
  status: Status;
  x: number;
  y: number;
  titleFontSize?: number;
  layout?: Layout;
  width?: number;
  height?: number;
};

export type GenerateInput = {
  greenfield?: boolean;
  components: ComponentInput[];
};

export type GeneratedOutput = {
  elements: JsonObject[];
  componentTargets: Record<string, string>;
};

export type Bounds = {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  width: number;
  height: number;
};

export type CatalogEntry = {
  service: string;
  aliases: string[];
  relativePath: string;
  assetPath: string;
  elements: JsonObject[];
  artworkBounds: Bounds;
};

export type Catalog = {
  path: string;
  entries: CatalogEntry[];
  byKey: Map<string, CatalogEntry>;
};

export type IdFactory = (kind: string) => string;

export const DEFAULT_TITLE_FONT_SIZE = 20;
export const LIFECYCLE_COLORS: Record<Status, string> = {
  existing: "#1e1e1e",
  changed: "#228be6",
  new: "#40c057",
  removed: "#fa5252",
};

const NORMAL_TEXT_COLOR = "#1e1e1e";
const MODULE_DIRECTORY = dirname(fileURLToPath(import.meta.url));
export const DEFAULT_CATALOG_PATH = resolve(
  MODULE_DIRECTORY,
  "../references/aws-icons.tsv",
);

const VALID_STATUSES = new Set<Status>([
  "existing",
  "changed",
  "new",
  "removed",
]);
const VALID_LAYOUTS = new Set<Layout>(["vertical", "horizontal"]);
const STALE_ELEMENT_FIELDS = new Set([
  "id",
  "version",
  "versionNonce",
  "index",
  "updated",
  "boundElements",
  "isDeleted",
]);

function fail(message: string): never {
  throw new Error(message);
}

function isObject(value: unknown): value is JsonObject {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function finiteNumber(value: unknown, field: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    fail(`${field} must be a finite number`);
  }
  return value;
}

function positiveNumber(value: unknown, field: string): number {
  const number = finiteNumber(value, field);
  if (number <= 0) {
    fail(`${field} must be greater than zero`);
  }
  return number;
}

function nonEmptyString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.trim() === "") {
    fail(`${field} must be a non-empty string`);
  }
  return value;
}

function round(value: number): number {
  return Math.round(value * 10_000) / 10_000;
}

export function normalizeServiceKey(value: string): string {
  return value.trim().toLocaleLowerCase("en-US").replace(/[\s_-]+/g, " ");
}

function defaultIdFactory(kind: string): string {
  const prefix = kind
    .toLocaleLowerCase("en-US")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 32) || "element";
  return `${prefix}-${randomUUID()}`;
}

function validatePoint(point: unknown, field: string): [number, number] {
  if (
    !Array.isArray(point) ||
    point.length !== 2 ||
    typeof point[0] !== "number" ||
    !Number.isFinite(point[0]) ||
    typeof point[1] !== "number" ||
    !Number.isFinite(point[1])
  ) {
    fail(`${field} must be a finite [x, y] point`);
  }
  return [point[0], point[1]];
}

export function elementBounds(element: JsonObject): Bounds {
  const x = finiteNumber(element.x, `${element.type ?? "element"}.x`);
  const y = finiteNumber(element.y, `${element.type ?? "element"}.y`);
  let minX = x;
  let minY = y;
  let maxX: number;
  let maxY: number;

  if (Array.isArray(element.points) && element.points.length > 0) {
    const points = element.points.map((point: unknown, index: number) =>
      validatePoint(point, `${element.type ?? "element"}.points[${index}]`),
    );
    minX = x + Math.min(...points.map((point) => point[0]));
    minY = y + Math.min(...points.map((point) => point[1]));
    maxX = x + Math.max(...points.map((point) => point[0]));
    maxY = y + Math.max(...points.map((point) => point[1]));
  } else {
    const width = positiveNumber(
      element.width,
      `${element.type ?? "element"}.width`,
    );
    const height = positiveNumber(
      element.height,
      `${element.type ?? "element"}.height`,
    );
    const isMcpTextSkeleton = element.type === "text" && !("id" in element);
    if (isMcpTextSkeleton && element.textAlign === "center") {
      minX = x - width / 2;
      maxX = x + width / 2;
    } else if (isMcpTextSkeleton && element.textAlign === "right") {
      minX = x - width;
      maxX = x;
    } else {
      maxX = x + width;
    }
    maxY = y + height;
  }

  return {
    minX,
    minY,
    maxX,
    maxY,
    width: maxX - minX,
    height: maxY - minY,
  };
}

function combinedBounds(elements: JsonObject[], assetPath: string): Bounds {
  if (elements.length === 0) {
    fail(`AWS asset ${assetPath} has no elements`);
  }
  const bounds = elements.map(elementBounds);
  const minX = Math.min(...bounds.map((item) => item.minX));
  const minY = Math.min(...bounds.map((item) => item.minY));
  const maxX = Math.max(...bounds.map((item) => item.maxX));
  const maxY = Math.max(...bounds.map((item) => item.maxY));
  if (maxX <= minX || maxY <= minY) {
    fail(`AWS asset ${assetPath} has invalid zero-sized artwork bounds`);
  }
  return {
    minX,
    minY,
    maxX,
    maxY,
    width: maxX - minX,
    height: maxY - minY,
  };
}

function validateSourceElements(elements: JsonObject[], assetPath: string): void {
  const ids = new Set<string>();
  for (const [index, element] of elements.entries()) {
    if (!isObject(element)) {
      fail(`AWS asset ${assetPath} element ${index + 1} must be an object`);
    }
    nonEmptyString(element.type, `${assetPath} element ${index + 1}.type`);
    const id = nonEmptyString(
      element.id,
      `${assetPath} element ${index + 1}.id`,
    );
    if (ids.has(id)) {
      fail(`AWS asset ${assetPath} contains duplicate element id ${id}`);
    }
    ids.add(id);
    elementBounds(element);
    if (
      element.groupIds !== undefined &&
      (!Array.isArray(element.groupIds) ||
        element.groupIds.some((groupId: unknown) =>
          typeof groupId !== "string" || groupId === ""
        ))
    ) {
      fail(`${assetPath} element ${id}.groupIds must contain non-empty strings`);
    }
  }

  for (const element of elements) {
    for (const field of ["containerId", "frameId"]) {
      const reference = element[field];
      if (reference !== null && reference !== undefined && !ids.has(reference)) {
        fail(`AWS asset ${assetPath} element ${element.id} has unknown ${field} ${reference}`);
      }
    }
    for (const field of ["startBinding", "endBinding"]) {
      const binding = element[field];
      if (binding === null || binding === undefined) {
        continue;
      }
      if (!isObject(binding) || !ids.has(binding.elementId)) {
        fail(
          `AWS asset ${assetPath} element ${element.id} has invalid ${field} target ${binding?.elementId ?? "<missing>"}`,
        );
      }
    }
  }
}

function loadAsset(assetPath: string): { elements: JsonObject[]; bounds: Bounds } {
  if (!existsSync(assetPath)) {
    fail(`AWS icon asset is missing: ${assetPath}`);
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(assetPath, "utf8"));
  } catch (error) {
    fail(`AWS icon asset is not valid JSON (${assetPath}): ${(error as Error).message}`);
  }
  if (!isObject(parsed) || !Array.isArray(parsed.elements)) {
    fail(`AWS icon asset ${assetPath} must contain an elements array`);
  }
  validateSourceElements(parsed.elements, assetPath);
  return {
    elements: parsed.elements,
    bounds: combinedBounds(parsed.elements, assetPath),
  };
}

export function loadCatalog(catalogPath = DEFAULT_CATALOG_PATH): Catalog {
  if (!existsSync(catalogPath)) {
    fail(`AWS icon catalog is missing: ${catalogPath}`);
  }
  const source = readFileSync(catalogPath, "utf8").replace(/^\uFEFF/, "");
  const lines = source.split(/\r?\n/);
  while (lines.at(-1) === "") {
    lines.pop();
  }
  if (lines.length === 0 || lines[0] !== "service\taliases\tpath") {
    fail(`${catalogPath}: row 1 must be exactly "service\\taliases\\tpath"`);
  }

  const entries: CatalogEntry[] = [];
  const byKey = new Map<string, CatalogEntry>();
  for (let index = 1; index < lines.length; index += 1) {
    const rowNumber = index + 1;
    const line = lines[index];
    if (line === "") {
      fail(`${catalogPath}: row ${rowNumber} is blank`);
    }
    const columns = line.split("\t");
    if (columns.length !== 3) {
      fail(
        `${catalogPath}: row ${rowNumber} must contain exactly 3 tab-separated columns; found ${columns.length}`,
      );
    }
    const service = nonEmptyString(columns[0], `${catalogPath}: row ${rowNumber} service`).trim();
    const aliasColumn = nonEmptyString(
      columns[1],
      `${catalogPath}: row ${rowNumber} aliases`,
    );
    const aliases = aliasColumn.split(",").map((alias) => alias.trim());
    if (aliases.some((alias) => alias === "")) {
      fail(`${catalogPath}: row ${rowNumber} contains an empty alias`);
    }
    const relativePath = nonEmptyString(
      columns[2],
      `${catalogPath}: row ${rowNumber} path`,
    ).trim();
    const assetPath = resolve(dirname(catalogPath), relativePath);
    const asset = loadAsset(assetPath);
    const entry: CatalogEntry = {
      service,
      aliases,
      relativePath,
      assetPath,
      elements: asset.elements,
      artworkBounds: asset.bounds,
    };
    entries.push(entry);

    for (const name of [service, ...aliases]) {
      const key = normalizeServiceKey(name);
      const existing = byKey.get(key);
      if (existing && existing !== entry) {
        fail(
          `${catalogPath}: row ${rowNumber} name or alias "${name}" conflicts with ${existing.service}`,
        );
      }
      byKey.set(key, entry);
    }
  }
  if (entries.length === 0) {
    fail(`${catalogPath} contains no AWS icon rows`);
  }
  return { path: catalogPath, entries, byKey };
}

export function resolveService(catalog: Catalog, service: string): CatalogEntry {
  const entry = catalog.byKey.get(normalizeServiceKey(service));
  if (!entry) {
    fail(
      `unknown AWS service "${service}"; use a service name or alias from ${catalog.path}`,
    );
  }
  return entry;
}

export function estimateTitleMetrics(title: string, fontSize: number): {
  width: number;
  height: number;
} {
  let emWidth = 0;
  for (const character of Array.from(title)) {
    if (/\s/.test(character)) {
      emWidth += 0.36;
    } else if (/[ilI1.,'`|!:;]/.test(character)) {
      emWidth += 0.34;
    } else if (/[mwMW@#%&]/.test(character)) {
      emWidth += 0.92;
    } else if (/[A-Z]/.test(character)) {
      emWidth += 0.7;
    } else {
      emWidth += 0.6;
    }
  }
  return {
    width: Math.ceil(Math.max(fontSize, emWidth * fontSize + fontSize * 0.2)),
    height: round(fontSize * 1.35),
  };
}

export function layoutTokens(titleFontSize: number): {
  horizontalPadding: number;
  verticalPadding: number;
  gap: number;
  artworkScale: number;
  minimumComponentWidth: number;
  minimumComponentHeight: number;
} {
  return {
    horizontalPadding: round(Math.max(16, titleFontSize * 1.2)),
    verticalPadding: round(Math.max(16, titleFontSize * 1.2)),
    gap: round(Math.max(12, titleFontSize * 0.8)),
    artworkScale: round(Math.max(0.875, titleFontSize / DEFAULT_TITLE_FONT_SIZE)),
    minimumComponentWidth: round(Math.max(160, titleFontSize * 8)),
    minimumComponentHeight: round(Math.max(100, titleFontSize * 5)),
  };
}

function validateComponent(
  value: unknown,
  index: number,
): ComponentInput & { titleFontSize: number; layout: Layout } {
  const prefix = `components[${index}]`;
  if (!isObject(value)) {
    fail(`${prefix} must be an object`);
  }
  const id = nonEmptyString(value.id, `${prefix}.id`);
  if (id !== id.trim()) {
    fail(`${prefix}.id must not have leading or trailing whitespace`);
  }
  const service = nonEmptyString(value.service, `${prefix}.service`);
  const title = nonEmptyString(value.title, `${prefix}.title`);
  if (/\r|\n/.test(title)) {
    fail(`${prefix}.title must be a single line; explicit title wrapping is not supported`);
  }
  const status = nonEmptyString(value.status, `${prefix}.status`) as Status;
  if (!VALID_STATUSES.has(status)) {
    fail(
      `${prefix}.status must be one of: ${[...VALID_STATUSES].join(", ")}; received "${status}"`,
    );
  }
  const layout = (value.layout ?? "vertical") as Layout;
  if (typeof layout !== "string" || !VALID_LAYOUTS.has(layout)) {
    fail(
      `${prefix}.layout must be one of: ${[...VALID_LAYOUTS].join(", ")}; received ${JSON.stringify(layout)}`,
    );
  }
  const titleFontSize = positiveNumber(
    value.titleFontSize ?? DEFAULT_TITLE_FONT_SIZE,
    `${prefix}.titleFontSize`,
  );
  if (titleFontSize < 14) {
    fail(`${prefix}.titleFontSize must be at least 14 for legible AWS service labels`);
  }
  const component: ComponentInput & { titleFontSize: number; layout: Layout } = {
    id,
    service,
    title,
    status,
    x: finiteNumber(value.x, `${prefix}.x`),
    y: finiteNumber(value.y, `${prefix}.y`),
    titleFontSize,
    layout,
  };
  if (value.width !== undefined) {
    component.width = positiveNumber(value.width, `${prefix}.width`);
  }
  if (value.height !== undefined) {
    component.height = positiveNumber(value.height, `${prefix}.height`);
  }
  return component;
}

function validateGenerateInput(input: unknown): {
  greenfield: boolean;
  components: Array<ComponentInput & { titleFontSize: number; layout: Layout }>;
} {
  if (!isObject(input)) {
    fail("input must be a JSON object");
  }
  if (input.greenfield !== undefined && typeof input.greenfield !== "boolean") {
    fail("greenfield must be a boolean when provided");
  }
  if (!Array.isArray(input.components)) {
    fail("components must be an array");
  }
  const components = input.components.map(validateComponent);
  const ids = new Set<string>();
  for (const component of components) {
    if (ids.has(component.id)) {
      fail(`duplicate component id "${component.id}"`);
    }
    ids.add(component.id);
  }
  return { greenfield: input.greenfield ?? false, components };
}

export function measureComponent(
  component: ComponentInput,
  entry: CatalogEntry,
): {
  width: number;
  height: number;
  minimumWidth: number;
  minimumHeight: number;
  artworkWidth: number;
  artworkHeight: number;
  titleWidth: number;
  titleHeight: number;
  horizontalPadding: number;
  verticalPadding: number;
  gap: number;
  artworkScale: number;
} {
  const fontSize = component.titleFontSize ?? DEFAULT_TITLE_FONT_SIZE;
  const layout = component.layout ?? "vertical";
  const tokens = layoutTokens(fontSize);
  const title = estimateTitleMetrics(component.title, fontSize);
  const artworkWidth = round(entry.artworkBounds.width * tokens.artworkScale);
  const artworkHeight = round(entry.artworkBounds.height * tokens.artworkScale);
  const minimumWidth = round(Math.max(
    tokens.minimumComponentWidth,
    layout === "vertical"
      ? tokens.horizontalPadding * 2 + Math.max(artworkWidth, title.width)
      : tokens.horizontalPadding * 2 + artworkWidth + tokens.gap + title.width,
  ));
  const minimumHeight = round(Math.max(
    tokens.minimumComponentHeight,
    layout === "vertical"
      ? tokens.verticalPadding * 2 + artworkHeight + tokens.gap + title.height
      : tokens.verticalPadding * 2 + Math.max(artworkHeight, title.height),
  ));
  const width = component.width ?? minimumWidth;
  const height = component.height ?? minimumHeight;
  if (width + 0.0001 < minimumWidth) {
    fail(
      `component "${component.id}" width ${width} is too small for ${layout} content; minimum is ${minimumWidth}`,
    );
  }
  if (height + 0.0001 < minimumHeight) {
    fail(
      `component "${component.id}" height ${height} is too small for ${layout} content; minimum is ${minimumHeight}`,
    );
  }
  return {
    width: round(width),
    height: round(height),
    minimumWidth,
    minimumHeight,
    artworkWidth,
    artworkHeight,
    titleWidth: title.width,
    titleHeight: title.height,
    ...tokens,
  };
}

function scaleOptionalPoint(value: unknown, scale: number): unknown {
  if (value === null || value === undefined) {
    return value;
  }
  const point = validatePoint(value, "linear element point");
  return [round(point[0] * scale), round(point[1] * scale)];
}

function remapBinding(
  value: unknown,
  idMap: Map<string, string>,
): unknown {
  if (value === null || value === undefined) {
    return value;
  }
  if (!isObject(value) || typeof value.elementId !== "string") {
    fail("source artwork contains a malformed binding");
  }
  const target = idMap.get(value.elementId);
  if (!target) {
    fail(`source artwork binding references unknown element ${value.elementId}`);
  }
  return { ...value, elementId: target };
}

function cloneArtwork(
  entry: CatalogEntry,
  targetX: number,
  targetY: number,
  scale: number,
  componentGroupId: string,
  idFactory: IdFactory,
): JsonObject[] {
  const idMap = new Map<string, string>();
  const groupMap = new Map<string, string>();
  for (const element of entry.elements) {
    idMap.set(element.id, idFactory(`aws-element:${entry.service}`));
    for (const groupId of element.groupIds ?? []) {
      if (!groupMap.has(groupId)) {
        groupMap.set(groupId, idFactory(`aws-group:${entry.service}`));
      }
    }
  }

  return entry.elements.map((source) => {
    const element = structuredClone(source);
    for (const field of STALE_ELEMENT_FIELDS) {
      delete element[field];
    }
    element.tempId = idMap.get(source.id);
    element.x = round(
      targetX + (source.x - entry.artworkBounds.minX) * scale,
    );
    element.y = round(
      targetY + (source.y - entry.artworkBounds.minY) * scale,
    );
    element.width = round(source.width * scale);
    element.height = round(source.height * scale);
    if (source.type === "text" && source.textAlign === "center") {
      element.x = round(element.x + element.width / 2);
    } else if (source.type === "text" && source.textAlign === "right") {
      element.x = round(element.x + element.width);
    }
    if (Array.isArray(source.points)) {
      element.points = source.points.map((point: unknown) =>
        scaleOptionalPoint(point, scale),
      );
    }
    if (source.lastCommittedPoint !== undefined) {
      element.lastCommittedPoint = scaleOptionalPoint(
        source.lastCommittedPoint,
        scale,
      );
    }
    if (typeof source.fontSize === "number") {
      element.fontSize = round(source.fontSize * scale);
    }
    if (typeof source.baseline === "number") {
      element.baseline = round(source.baseline * scale);
    }
    if (typeof source.strokeWidth === "number") {
      element.strokeWidth = round(source.strokeWidth * scale);
    }
    element.groupIds = (source.groupIds ?? []).map((groupId: string) =>
      groupMap.get(groupId),
    );
    element.groupIds.push(componentGroupId);
    for (const field of ["containerId", "frameId"]) {
      if (source[field] === null || source[field] === undefined) {
        element[field] = source[field] ?? null;
      } else {
        element[field] = idMap.get(source[field]) ?? null;
      }
    }
    element.startBinding = remapBinding(source.startBinding, idMap);
    element.endBinding = remapBinding(source.endBinding, idMap);
    return element;
  });
}

function buildComponent(
  component: ComponentInput & { titleFontSize: number; layout: Layout },
  entry: CatalogEntry,
  greenfield: boolean,
  idFactory: IdFactory,
): { elements: JsonObject[]; boxTempId: string } {
  const measurement = measureComponent(component, entry);
  const componentGroupId = idFactory(`component-group:${component.id}`);
  const boxTempId = idFactory(`component-box:${component.id}`);
  const titleTempId = idFactory(`component-title:${component.id}`);
  const x = component.x;
  const y = component.y;

  let artworkX: number;
  let artworkY: number;
  let titleX: number;
  let titleY: number;
  if (component.layout === "vertical") {
    const contentHeight =
      measurement.artworkHeight + measurement.gap + measurement.titleHeight;
    artworkX = x + (measurement.width - measurement.artworkWidth) / 2;
    artworkY = y + (measurement.height - contentHeight) / 2;
    titleX = x + (measurement.width - measurement.titleWidth) / 2;
    titleY = artworkY + measurement.artworkHeight + measurement.gap;
  } else {
    const contentWidth =
      measurement.artworkWidth + measurement.gap + measurement.titleWidth;
    artworkX = x + (measurement.width - contentWidth) / 2;
    artworkY = y + (measurement.height - measurement.artworkHeight) / 2;
    titleX = artworkX + measurement.artworkWidth + measurement.gap;
    titleY = y + (measurement.height - measurement.titleHeight) / 2;
  }

  const box: JsonObject = {
    type: "rectangle",
    tempId: boxTempId,
    x: round(x),
    y: round(y),
    width: measurement.width,
    height: measurement.height,
    strokeColor: greenfield ? LIFECYCLE_COLORS.existing : LIFECYCLE_COLORS[component.status],
    backgroundColor: "transparent",
    fillStyle: "solid",
    strokeWidth: 2,
    strokeStyle: "solid",
    roughness: 1,
    opacity: 100,
    angle: 0,
    roundness: { type: 3 },
    groupIds: [componentGroupId],
  };
  const title: JsonObject = {
    type: "text",
    tempId: titleTempId,
    x: round(titleX + measurement.titleWidth / 2),
    y: round(titleY),
    width: measurement.titleWidth,
    height: measurement.titleHeight,
    text: component.title,
    originalText: component.title,
    fontSize: component.titleFontSize,
    fontFamily: 5,
    textAlign: "center",
    verticalAlign: "top",
    lineHeight: 1.25,
    baseline: round(component.titleFontSize * 0.9),
    strokeColor: NORMAL_TEXT_COLOR,
    backgroundColor: "transparent",
    fillStyle: "solid",
    strokeWidth: 1,
    strokeStyle: "solid",
    roughness: 1,
    opacity: 100,
    angle: 0,
    containerId: null,
    groupIds: [componentGroupId],
    autoResize: true,
  };
  const artwork = cloneArtwork(
    entry,
    round(artworkX),
    round(artworkY),
    measurement.artworkScale,
    componentGroupId,
    idFactory,
  );
  return { elements: [box, ...artwork, title], boxTempId };
}

export function generateComponents(
  input: unknown,
  options: { catalog?: Catalog; idFactory?: IdFactory } = {},
): GeneratedOutput {
  const validated = validateGenerateInput(input);
  const catalog = options.catalog ?? loadCatalog();
  const idFactory = options.idFactory ?? defaultIdFactory;
  const output: GeneratedOutput = { elements: [], componentTargets: {} };
  for (const component of validated.components) {
    const entry = resolveService(catalog, component.service);
    const generated = buildComponent(
      component,
      entry,
      validated.greenfield,
      idFactory,
    );
    output.elements.push(...generated.elements);
    output.componentTargets[component.id] = generated.boxTempId;
  }
  validateGeneratedOutput(output);
  return output;
}

function collectReferenceIds(element: JsonObject): string[] {
  const references: string[] = [];
  for (const field of ["containerId", "frameId"]) {
    if (typeof element[field] === "string") {
      references.push(element[field]);
    }
  }
  for (const field of ["startBinding", "endBinding"]) {
    if (isObject(element[field]) && typeof element[field].elementId === "string") {
      references.push(element[field].elementId);
    }
  }
  return references;
}

export function validateGeneratedOutput(output: unknown): void {
  if (!isObject(output) || !Array.isArray(output.elements)) {
    fail("generated output must contain an elements array");
  }
  if (!isObject(output.componentTargets)) {
    fail("generated output must contain a componentTargets object");
  }
  const ids = new Set<string>();
  for (const [index, element] of output.elements.entries()) {
    if (!isObject(element)) {
      fail(`generated element ${index} must be an object`);
    }
    const tempId = nonEmptyString(element.tempId, `generated element ${index}.tempId`);
    if (ids.has(tempId)) {
      fail(`generated output contains duplicate tempId ${tempId}`);
    }
    ids.add(tempId);
    elementBounds(element);
    for (const field of STALE_ELEMENT_FIELDS) {
      if (field in element) {
        fail(`generated element ${tempId} contains stale field ${field}`);
      }
    }
    if (!Array.isArray(element.groupIds) || element.groupIds.length === 0) {
      fail(`generated element ${tempId} must have at least one groupId`);
    }
  }
  for (const element of output.elements) {
    for (const reference of collectReferenceIds(element)) {
      if (!ids.has(reference)) {
        fail(`generated element ${element.tempId} references unknown tempId ${reference}`);
      }
    }
  }
  const targetIds = new Set<string>();
  for (const [componentId, tempId] of Object.entries(output.componentTargets)) {
    if (typeof tempId !== "string" || !ids.has(tempId)) {
      fail(`componentTargets.${componentId} does not reference a generated tempId`);
    }
    if (targetIds.has(tempId)) {
      fail(`componentTargets reuses outer box tempId ${tempId}`);
    }
    targetIds.add(tempId);
    const element = output.elements.find((candidate) => candidate.tempId === tempId);
    if (element?.type !== "rectangle") {
      fail(`componentTargets.${componentId} must reference an outer rectangle`);
    }
  }
}

function mergeOutput(target: GeneratedOutput, addition: GeneratedOutput): void {
  target.elements.push(...addition.elements);
  for (const [componentId, tempId] of Object.entries(addition.componentTargets)) {
    if (componentId in target.componentTargets) {
      fail(`preview generated duplicate component id ${componentId}`);
    }
    target.componentTargets[componentId] = tempId;
  }
}

function previewTitle(entry: CatalogEntry, index: number): string {
  if (index % 5 === 0) {
    return `${entry.service} integration and event processing coordinator`;
  }
  if (index % 3 === 0) {
    return "Worker";
  }
  return `${entry.service} component`;
}

export function createPreview(
  options: { catalog?: Catalog; idFactory?: IdFactory } = {},
): GeneratedOutput {
  const catalog = options.catalog ?? loadCatalog();
  const idFactory = options.idFactory ?? defaultIdFactory;
  const output: GeneratedOutput = { elements: [], componentTargets: {} };
  const statuses: Status[] = ["existing", "changed", "new", "removed"];
  const columns = 4;
  const columnGap = 72;
  const rowGap = 72;
  let rowY = 80;

  for (let rowStart = 0; rowStart < catalog.entries.length; rowStart += columns) {
    const rowEntries = catalog.entries.slice(rowStart, rowStart + columns);
    let columnX = 80;
    const rowComponents = rowEntries.map((entry, offset) => {
      const index = rowStart + offset;
      const component = {
        id: `vertical-${index + 1}`,
        service: entry.service,
        title: previewTitle(entry, index),
        status: statuses[index % statuses.length],
        x: columnX,
        y: rowY,
        titleFontSize: index % 6 === 0 ? 22 : 20,
        layout: "vertical" as const,
      };
      columnX += measureComponent(component, entry).width + columnGap;
      return component;
    });
    const rowOutput = generateComponents(
      { greenfield: false, components: rowComponents },
      { catalog, idFactory },
    );
    mergeOutput(output, rowOutput);
    const boxes = rowComponents.map((component) => {
      const target = rowOutput.componentTargets[component.id];
      return rowOutput.elements.find((element) => element.tempId === target)!;
    });
    rowY += Math.max(...boxes.map((box) => box.height)) + rowGap;
  }

  const horizontalEntries = [
    catalog.entries[0],
    catalog.entries[Math.floor(catalog.entries.length / 2)],
    resolveService(catalog, "lambda"),
    catalog.entries.at(-1)!,
  ];
  const horizontalDrafts = horizontalEntries.map((entry, index) => ({
    id: `horizontal-${index + 1}`,
    service: entry.service,
    title:
      index === 1
        ? "Long horizontal architectural title for content-aware sizing"
        : `${entry.service} handler`,
    status: statuses[(index + 1) % statuses.length],
    x: 80 + (index % 2) * 1000,
    y: rowY + Math.floor(index / 2) * 280,
    titleFontSize: 20,
    layout: "horizontal" as const,
  }));
  const firstHorizontalEntry = resolveService(catalog, horizontalDrafts[0].service);
  const firstHorizontalSize = measureComponent(horizontalDrafts[0], firstHorizontalEntry);
  const fourthHorizontalEntry = resolveService(catalog, horizontalDrafts[3].service);
  const fourthHorizontalSize = measureComponent(horizontalDrafts[3], fourthHorizontalEntry);
  const horizontalComponents: ComponentInput[] = horizontalDrafts.map((component, index) => {
    if (index === 0) {
      return {
        ...component,
        width: firstHorizontalSize.minimumWidth + 120,
      };
    }
    if (index === 3) {
      return {
        ...component,
        height: fourthHorizontalSize.minimumHeight + 80,
      };
    }
    return component;
  });
  mergeOutput(
    output,
    generateComponents(
      { greenfield: false, components: horizontalComponents },
      { catalog, idFactory },
    ),
  );

  const greenfieldY = rowY + 600;
  mergeOutput(
    output,
    generateComponents(
      {
        greenfield: true,
        components: [
          {
            id: "greenfield-new",
            service: "lambda",
            title: "Greenfield worker",
            status: "new",
            x: 80,
            y: greenfieldY,
            layout: "vertical",
          },
          {
            id: "greenfield-removed",
            service: "lambda",
            title: "Greenfield duplicate",
            status: "removed",
            x: 600,
            y: greenfieldY,
            layout: "vertical",
          },
        ],
      },
      { catalog, idFactory },
    ),
  );
  validateGeneratedOutput(output);
  return output;
}

export function validateCatalogAndGenerator(
  catalog = loadCatalog(),
): { services: number; assets: number; generatedElements: number } {
  const validationInput: GenerateInput = {
    greenfield: false,
    components: catalog.entries.map((entry, index) => ({
      id: `validate-${index + 1}`,
      service: index % 2 === 0 ? entry.service : entry.aliases[0],
      title: `${entry.service} validation component`,
      status: (["existing", "changed", "new", "removed"] as Status[])[index % 4],
      x: (index % 4) * 500,
      y: Math.floor(index / 4) * 300,
      layout: index % 5 === 0 ? "horizontal" : "vertical",
    })),
  };
  const generated = generateComponents(validationInput, { catalog });
  validateGeneratedOutput(generated);
  return {
    services: catalog.entries.length,
    assets: new Set(catalog.entries.map((entry) => entry.assetPath)).size,
    generatedElements: generated.elements.length,
  };
}

function parseOutputFlag(args: string[]): { args: string[]; outputPath?: string } {
  const remaining: string[] = [];
  let outputPath: string | undefined;
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === "--output" || argument === "-o") {
      if (outputPath !== undefined) {
        fail("--output may only be provided once");
      }
      const value = args[index + 1];
      if (!value || value.startsWith("-")) {
        fail(`${argument} requires a file path`);
      }
      outputPath = value;
      index += 1;
    } else {
      remaining.push(argument);
    }
  }
  return { args: remaining, outputPath };
}

function emitJson(value: unknown, outputPath?: string): void {
  const json = `${JSON.stringify(value, null, 2)}\n`;
  if (outputPath) {
    writeFileSync(outputPath, json, "utf8");
  } else {
    process.stdout.write(json);
  }
}

function usage(): string {
  return [
    "Usage:",
    "  node scripts/prepare-components.ts generate <placements.json|-> [--output <file>]",
    "  node scripts/prepare-components.ts validate",
    "  node scripts/prepare-components.ts preview --all [--output <file>]",
  ].join("\n");
}

export async function runCli(argv = process.argv.slice(2)): Promise<void> {
  const command = argv[0];
  const parsed = parseOutputFlag(argv.slice(1));
  if (command === "generate") {
    if (parsed.args.length !== 1) {
      fail(`generate requires exactly one input file\n${usage()}`);
    }
    const inputPath = parsed.args[0];
    let input: unknown;
    try {
      input = JSON.parse(
        inputPath === "-"
          ? readFileSync(0, "utf8")
          : readFileSync(inputPath, "utf8"),
      );
    } catch (error) {
      fail(`could not read generate input ${inputPath}: ${(error as Error).message}`);
    }
    emitJson(generateComponents(input), parsed.outputPath);
    return;
  }
  if (command === "validate") {
    if (parsed.args.length !== 0 || parsed.outputPath) {
      fail(`validate does not accept arguments\n${usage()}`);
    }
    emitJson({ valid: true, ...validateCatalogAndGenerator() });
    return;
  }
  if (command === "preview") {
    if (parsed.args.length !== 1 || parsed.args[0] !== "--all") {
      fail(`preview requires --all\n${usage()}`);
    }
    emitJson(createPreview(), parsed.outputPath);
    return;
  }
  fail(usage());
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : "";
if (invokedPath === fileURLToPath(import.meta.url)) {
  runCli().catch((error: unknown) => {
    process.stderr.write(`prepare-components: ${(error as Error).message}\n`);
    process.exitCode = 1;
  });
}
