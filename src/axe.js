import { execFileSync, execSync } from "child_process";

// Map AXe type field → UIKit class names
const TYPE_MAP = {
  Application: "UIApplication",
  Window: "UIWindow",
  GenericElement: "UIView",
  Button: "UIButton",
  StaticText: "UILabel",
  Image: "UIImageView",
  TextField: "UITextField",
  SecureTextField: "UITextField",
  TextView: "UITextView",
  ScrollView: "UIScrollView",
  Table: "UITableView",
  Cell: "UITableViewCell",
  CollectionView: "UICollectionView",
  NavigationBar: "UINavigationBar",
  TabBar: "UITabBar",
  Toolbar: "UIToolbar",
  SearchField: "UISearchBar",
  Switch: "UISwitch",
  Slider: "UISlider",
  Stepper: "UIStepper",
  ProgressIndicator: "UIProgressView",
  ActivityIndicator: "UIActivityIndicatorView",
  PageIndicator: "UIPageControl",
  Picker: "UIPickerView",
  DatePicker: "UIDatePicker",
  Map: "MKMapView",
  WebView: "WKWebView",
  SegmentedControl: "UISegmentedControl",
  Alert: "UIAlertController",
  Sheet: "UIAlertController",
  Heading: "UILabel",
  Link: "UIButton",
  Group: "UIView",
};

/**
 * Get the booted simulator UDID.
 */
function getBootedUdid() {
  try {
    const output = execSync("xcrun simctl list devices booted", {
      encoding: "utf-8",
      timeout: 5000,
    });
    const match = output.match(/\(([A-F0-9-]{36})\)\s*\(Booted\)/);
    return match ? match[1] : null;
  } catch {
    return null;
  }
}

/**
 * Parse AXTraits bitmask into capabilities array.
 */
function parseTraits(traits) {
  if (!traits || typeof traits !== "string") return [];
  
  const traitMap = {
    "button": "isButton",
    "link": "isLink", 
    "header": "isHeader",
    "searchfield": "isSearchField",
    "image": "isImage",
    "selected": "isSelected",
    "plays sound": "playsSound",
    "keyboard key": "isKeyboardKey",
    "static text": "isStaticText",
    "summary element": "isSummaryElement",
    "not enabled": "isNotEnabled",
    "updates frequently": "updatesFrequently",
    "starts media session": "startsMediaSession",
    "adjustable": "isAdjustable",
    "allows direct interaction": "allowsDirectInteraction",
    "causes page turn": "causesPageTurn",
    "tab bar": "isTabBar",
    "text entry": "isTextEntry",
  };
  
  const lower = traits.toLowerCase();
  const capabilities = [];
  
  for (const [key, cap] of Object.entries(traitMap)) {
    if (lower.includes(key)) {
      capabilities.push(cap);
    }
  }
  
  return capabilities;
}

/**
 * Transform a single AXe JSON node into our normalized format.
 */
function transformNode(node) {
  const axeType = node.type || "GenericElement";
  const className = TYPE_MAP[axeType] || "UIView";
  const identifier = node.AXUniqueId || "";
  const label = node.AXLabel || "";
  const name = identifier || label || "";
  const id = identifier || `${className}_${label || "anon_" + Math.random().toString(36).slice(2, 8)}`;

  const frame = node.frame
    ? {
        x: Math.round(node.frame.x * 100) / 100,
        y: Math.round(node.frame.y * 100) / 100,
        w: Math.round(node.frame.width * 100) / 100,
        h: Math.round(node.frame.height * 100) / 100,
      }
    : { x: 0, y: 0, w: 0, h: 0 };

  // Parse AXTraits into capabilities
  const traits = node.AXTraits || node.traits || "";
  const capabilities = parseTraits(traits);

  const children = (node.children || []).map(transformNode);

  return {
    className,
    axeType,
    role: node.role || "",
    roleDescription: node.role_description || "",
    identifier,
    label,
    name,
    id,
    frame,
    value: node.AXValue || null,
    help: node.help || node.AXHelp || null,
    hint: node.hint || node.AXHint || null,
    traits: traits,
    capabilities,
    customActions: node.AXCustomActions || null,
    enabled: node.enabled !== false,
    children,
  };
}

/**
 * Flatten tree into a list (preserving parent IDs).
 */
export function flattenTree(nodes, parentId = null) {
  const result = [];
  for (const node of nodes) {
    const { children, ...flat } = node;
    result.push({ ...flat, parentId });
    result.push(...flattenTree(children, flat.id));
  }
  return result;
}

/**
 * Run AXe and parse the hierarchy.
 * @param {string} [udid] - Simulator UDID (auto-detects booted if omitted)
 * @returns {{ tree: object[], flat: object[] }}
 */
export function describeUI(udid) {
  // AXe requires --udid, so resolve it
  let resolvedUdid = udid || getBootedUdid();
  if (resolvedUdid === "booted") {
    resolvedUdid = getBootedUdid();
  }
  if (!resolvedUdid) {
    throw new Error("No booted simulator found. Start a simulator first.");
  }

  const udidPattern = /^[A-F0-9-]{36}$/i;
  if (!udidPattern.test(resolvedUdid)) {
    throw new Error(`Invalid simulator UDID: ${resolvedUdid}`);
  }

  let output;
  try {
    output = execFileSync("axe", ["describe-ui", "--udid", resolvedUdid], {
      encoding: "utf-8",
      timeout: 15000,
      maxBuffer: 10 * 1024 * 1024,
    });
  } catch (err) {
    throw new Error(`AXe failed: ${err.message}`);
  }

  // AXe outputs a JSON array
  let rawTree;
  try {
    rawTree = JSON.parse(output);
  } catch (err) {
    throw new Error(`Failed to parse AXe JSON output: ${err.message}`);
  }

  if (!Array.isArray(rawTree)) {
    throw new Error("AXe output is not a JSON array");
  }

  // Transform to our normalized format
  const tree = rawTree.map(transformNode);
  const flat = flattenTree(tree);

  return { tree, flat };
}
