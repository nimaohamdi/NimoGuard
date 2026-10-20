import { realpath } from "node:fs/promises";
import path from "node:path";

// Resolves a path to its real, symlink-free location — even if the path
// itself (or its leaf component) doesn't exist yet, by walking up to the
// nearest existing ancestor directory and appending the rest literally.
export async function resolveRealTarget(targetPath: string): Promise<string> {
  try {
    return await realpath(targetPath);
  } catch {
    const parent = path.dirname(targetPath);
    if (parent === targetPath) {
      // Reached the filesystem root and even that failed; give up and
      // return the original path unresolved.
      return targetPath;
    }
    const realParent = await resolveRealTarget(parent);
    return path.join(realParent, path.basename(targetPath));
  }
}
