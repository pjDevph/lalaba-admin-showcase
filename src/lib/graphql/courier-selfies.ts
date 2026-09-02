import { graphqlFetch } from "@/lib/api-client";

// Hand-maintained enum mirrors — this project has no GraphQL codegen. Keep in
// sync with LALABA_BE_DEV/src/courier-verification/schemas/courier-selfie.schema.ts.

export type CourierSelfieStatus = "ACTIVE" | "SUPERSEDED" | "REVOKED";

export type LivenessChallenge = "BLINK" | "TURN_LEFT" | "TURN_RIGHT";

export const LIVENESS_CHALLENGE_LABELS: Record<LivenessChallenge, string> = {
  BLINK: "Blink",
  TURN_LEFT: "Turn head left",
  TURN_RIGHT: "Turn head right",
};

export type LivenessMetadata = {
  durationMs: number;
  eyesOpenScore: number;
  yawDegrees: number;
  pitchDegrees: number;
  attemptCount: number;
};

export type CourierSelfie = {
  _id: string;
  courierUid: string;
  publicUrl: string;
  status: CourierSelfieStatus;
  livenessChallenge: LivenessChallenge;
  livenessMetadata: LivenessMetadata;
  submittedAt: string;
  revokedAt: string | null;
  revocationReason: string | null;
};

const SELFIE_FIELDS = `
  _id
  courierUid
  publicUrl
  status
  livenessChallenge
  livenessMetadata {
    durationMs
    eyesOpenScore
    yawDegrees
    pitchDegrees
    attemptCount
  }
  submittedAt
  revokedAt
  revocationReason
`;

const QUEUE_QUERY = `
  query CourierSelfieQueue($limit: Int, $offset: Int) {
    courierSelfieQueue(limit: $limit, offset: $offset) {
      ${SELFIE_FIELDS}
    }
  }
`;

/**
 * Live courier selfies, newest first.
 *
 * Unlike the KYC queue there is no claim step and no approve: a selfie is
 * already live and already the courier's public profile picture by the time it
 * appears here. Review is post-hoc, and the only verdict is revoke.
 */
export async function listCourierSelfieQueue(filter: {
  limit: number;
  offset: number;
}) {
  const { courierSelfieQueue } = await graphqlFetch<{
    courierSelfieQueue: CourierSelfie[];
  }>(QUEUE_QUERY, filter);
  return courierSelfieQueue;
}

const REVOKE_MUTATION = `
  mutation RevokeCourierSelfie($selfieId: ID!, $reason: String!) {
    revokeCourierSelfie(selfieId: $selfieId, reason: $reason) {
      _id
      status
      revokedAt
      revocationReason
    }
  }
`;

/**
 * Take a selfie down.
 *
 * Two things happen server-side, and both are irreversible: the courier is
 * re-locked out of order handling until they retake, and the image is DELETED
 * from the public bucket — so the URL in this table stops resolving. There is
 * no un-revoke; the courier submits a new photo instead.
 */
export function revokeCourierSelfie(selfieId: string, reason: string) {
  return graphqlFetch(REVOKE_MUTATION, { selfieId, reason });
}
