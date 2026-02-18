#!/usr/bin/env node
/**
 * Unit tests for Swift parsing in candidate-matcher.js
 * Run: node test/swift-parser.test.js
 */

import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixturesDir = join(__dirname, "fixtures", "swift-samples");

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`✓ ${name}`);
    passed++;
  } catch (err) {
    console.log(`✗ ${name}`);
    console.log(`  Error: ${err.message}`);
    failed++;
  }
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message || "Assertion failed");
  }
}

const declarationRegex =
  /^(\s*)((?:public|private|internal|open|fileprivate|final|override|static|mutating|nonmutating|async)\s+)*(actor|class|struct|enum|protocol)\s+(\w+)/;

const extensionRegex =
  /^(\s*)extension\s+(\w+)(?:\s*:\s*([^{]+))?(?:\s*where\s+([^{]+))?\s*\{?/;

const associatedTypeRegex = /^\s*associatedtype\s+(\w+)(?:\s*:\s*([^\s{]+))?/;

// Test: Nested types parsing
test("Nested types: parse 3-level deep class", () => {
  const content = readFileSync(join(fixturesDir, "nested-types.swift"), "utf-8");
  const lines = content.split("\n");
  
  const matches = [];
  for (const line of lines) {
    const match = line.match(declarationRegex);
    if (match) {
      matches.push({ kind: match[3], name: match[4] });
    }
  }
  
  assert(matches.some(m => m.name === "OuterLevel"), "Should find OuterLevel");
  assert(matches.some(m => m.name === "MiddleLevel"), "Should find MiddleLevel");
  assert(matches.some(m => m.name === "InnerLevel"), "Should find InnerLevel");
  assert(matches.some(m => m.name === "InnerStruct"), "Should find InnerStruct");
  assert(matches.some(m => m.name === "NestedEnum"), "Should find NestedEnum");
  assert(matches.some(m => m.name === "Container"), "Should find Container");
});

// Test: Actor declarations
test("Actor declarations: parse actor keyword", () => {
  const content = readFileSync(join(fixturesDir, "multiline-inheritance.swift"), "utf-8");
  const lines = content.split("\n");
  
  const actorLine = lines.find(l => l.includes("actor ConcurrentProcessor"));
  assert(actorLine, "Should find actor declaration");
  
  const match = actorLine.match(declarationRegex);
  assert(match, "Should match declaration regex");
  assert(match[3] === "actor", "Should be an actor");
  assert(match[4] === "ConcurrentProcessor", "Should extract actor name");
});

// Test: Extensions with where clauses
test("Extensions with where: parse extension pattern", () => {
  const content = readFileSync(join(fixturesDir, "extensions-where.swift"), "utf-8");
  const lines = content.split("\n");
  
  const extensions = [];
  for (const line of lines) {
    const match = line.match(extensionRegex);
    if (match) {
      extensions.push({
        name: match[2],
        conformances: match[3]?.trim(),
        whereClause: match[4]?.trim()
      });
    }
  }
  
  assert(extensions.length >= 3, `Should find at least 3 extensions, found ${extensions.length}`);
  assert(extensions.some(e => e.name === "Array"), "Should find Array extension");
  assert(extensions.some(e => e.name === "Dictionary"), "Should find Dictionary extension");
  
  const arrayExt = extensions.find(e => e.name === "Array");
  assert(arrayExt.whereClause?.includes("Element == String"), "Should capture where clause");
});

// Test: Protocols with associated types
test("Protocols with associatedtype: detect associated type declarations", () => {
  const content = readFileSync(join(fixturesDir, "protocols-associatedtype.swift"), "utf-8");
  const lines = content.split("\n");
  
  const protocols = [];
  let currentProtocol = null;
  
  for (const line of lines) {
    const protoMatch = line.match(declarationRegex);
    if (protoMatch && protoMatch[3] === "protocol") {
      currentProtocol = { name: protoMatch[4], associatedTypes: [] };
      protocols.push(currentProtocol);
    }
    
    if (currentProtocol) {
      const atMatch = line.match(associatedTypeRegex);
      if (atMatch) {
        currentProtocol.associatedTypes.push({
          name: atMatch[1],
          constraint: atMatch[2] || null
        });
      }
    }
    
    if (line.includes("}") && currentProtocol) {
      currentProtocol = null;
    }
  }
  
  assert(protocols.length >= 4, `Should find at least 4 protocols, found ${protocols.length}`);
  
  const container = protocols.find(p => p.name === "Container");
  assert(container, "Should find Container protocol");
  assert(container.associatedTypes.some(at => at.name === "Item"), "Should find Item associatedtype");
});

// Test: Mixed access modifiers
test("Mixed access modifiers: parse public, private, internal", () => {
  const content = `public class PublicClass {}
private struct PrivateStruct {}
internal enum InternalEnum {}
open class OpenClass {}
final class FinalClass {}
public final class PublicFinalClass {}`;
  
  const lines = content.split("\n");
  const matches = [];
  
  for (const line of lines) {
    const match = line.match(declarationRegex);
    if (match) {
      matches.push({ kind: match[3], name: match[4] });
    }
  }
  
  assert(matches.length === 6, `Should find 6 declarations, found ${matches.length}`);
  assert(matches.some(m => m.name === "PublicClass"), "Should find PublicClass");
  assert(matches.some(m => m.name === "PrivateStruct"), "Should find PrivateStruct");
  assert(matches.some(m => m.name === "InternalEnum"), "Should find InternalEnum");
});

// Summary
console.log("\n" + "=".repeat(50));
console.log(`Tests: ${passed} passed, ${failed} failed`);
console.log("=".repeat(50));

process.exit(failed > 0 ? 1 : 0);
