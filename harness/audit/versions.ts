// Version manifest recorded once per investigation session (see
// FINAL_VALIDATION_CHECKLIST.md "Session audit": "Model version is
// recorded", "Policy version is recorded", ...). All eight components are
// required — an incomplete manifest is rejected outright rather than
// silently recorded with a gap.
import { z } from "zod";
import { MissingVersionComponentError } from "./errors.js";

const versionManifestSchema = z.object({
  agentVersion: z.string().min(1),
  modelVersion: z.string().min(1),
  policyVersion: z.string().min(1),
  toolVersion: z.string().min(1),
  sandboxVersion: z.string().min(1),
  approvalVersion: z.string().min(1),
  mutationVersion: z.string().min(1),
  verificationVersion: z.string().min(1),
});

export type VersionManifestInput = z.infer<typeof versionManifestSchema>;
export type VersionManifest = Readonly<VersionManifestInput>;

/** Validates that every required version component is present and non-empty. */
export function buildVersionManifest(
  input: VersionManifestInput,
): VersionManifest {
  const parsed = versionManifestSchema.safeParse(input);
  if (!parsed.success) {
    throw new MissingVersionComponentError(
      parsed.error.issues.map(
        (issue) => `${issue.path.join(".") || "input"}: ${issue.message}`,
      ),
    );
  }
  return parsed.data;
}
