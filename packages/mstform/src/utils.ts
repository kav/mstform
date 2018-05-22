import { isObservable, toJS } from "mobx";
// have to use this here but loses type information
export const equal = require("fast-deep-equal");

export function identity<T>(value: T): T {
  return value;
}

export function pathToSteps(path: string): string[] {
  if (path.startsWith("/")) {
    path = path.slice(1);
  }
  return path.split("/");
}

export function stepsToPath(parts: string[]): string {
  const result = parts.join("/");
  if (!result.startsWith("/")) {
    return "/" + result;
  }
  return result;
}

export function isInt(s: string): boolean {
  return Number.isInteger(parseInt(s, 10));
}

export function unwrap(o: any): any {
  if (isObservable(o)) {
    return toJS(o);
  }
  return o;
}

export function getByPath(obj: any, path: string): string | undefined {
  return getBySteps(obj, pathToSteps(path));
}

function getBySteps(obj: any, steps: string[]): string | undefined {
  const [first, ...rest] = steps;
  if (rest.length === 0) {
    return obj[first];
  }
  let sub = obj[first];
  if (sub === undefined) {
    return undefined;
  }
  return getBySteps(sub, rest);
}

export function removePath(
  map: Map<string, any>,
  path: string
): Map<string, any> {
  const parts = pathToSteps(path);
  const last = parts[parts.length - 1];
  let removedIndex = parseInt(last, 10);
  const basePath = stepsToPath(parts.slice(0, parts.length - 1));

  const result = new Map();
  map.forEach((value, key) => {
    if (!key.startsWith(basePath)) {
      result.set(key, value);
      return;
    }
    const withoutBase = key.slice(basePath.length + 1);
    const pathParts = pathToSteps(withoutBase);

    const number = parseInt(pathParts[0], 10);
    if (isNaN(number)) {
      result.set(key, value);
      return;
    }
    if (number < removedIndex) {
      result.set(key, value);
      return;
    } else if (number === removedIndex) {
      // we don't want it in the new map
      return;
    }
    const restParts = pathParts.slice(1);
    const newPath =
      basePath + stepsToPath([(number - 1).toString(), ...restParts]);
    result.delete(key);
    result.set(newPath, value);
  });
  return result;
}
