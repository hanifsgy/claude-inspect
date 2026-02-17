import { execSync } from "child_process";

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
    help: node.help || null,
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
  const resolvedUdid = udid || getBootedUdid();
  if (!resolvedUdid) {
    throw new Error("No booted simulator found. Start a simulator first.");
  }

  let output;
  try {
    output = execSync(`axe describe-ui --udid ${resolvedUdid}`, {
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
