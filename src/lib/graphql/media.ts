import { graphqlFetch } from "@/lib/api-client";

/**
 * Image upload, for admin-authored artwork.
 *
 * The backend allowlists the FIRST path segment of the folder and rejects
 * anything else with "Invalid upload destination." — a deliberate boundary
 * keeping caller-chosen paths away from KYC/evidence roots. `branding` is on
 * that list, so campaign artwork nests under it rather than claiming a new
 * root. Two screens in the partner app have already shipped broken by
 * inventing a flat folder name; don't be the third.
 */
export const CAMPAIGN_IMAGE_FOLDER = "branding/campaigns";

/** The bytes are sniffed server-side (SEC-006) — the declared type must match
 *  the file's real magic bytes, so a renamed .svg cannot pose as a PNG. */
const ACCEPTED = ["image/jpeg", "image/png", "image/webp"];

export const CAMPAIGN_IMAGE_ACCEPT = ACCEPTED.join(",");

/** 5 MB. A popup is one screen of artwork; anything larger is a mistake that
 *  would cost every viewer their data allowance. */
export const CAMPAIGN_IMAGE_MAX_BYTES = 5 * 1024 * 1024;

export class ImageRejected extends Error {}

export async function uploadCampaignImage(file: File): Promise<string> {
  if (!ACCEPTED.includes(file.type)) {
    throw new ImageRejected("Use a JPG, PNG or WebP image.");
  }
  if (file.size > CAMPAIGN_IMAGE_MAX_BYTES) {
    throw new ImageRejected("That image is over 5 MB — please compress it.");
  }

  const base64 = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new ImageRejected("Could not read that file."));
    reader.onload = () => {
      const result = String(reader.result ?? "");
      // Strip the `data:image/png;base64,` prefix — the backend accepts either,
      // but sending the bare payload keeps the request smaller and the
      // contract obvious.
      resolve(result.includes(",") ? result.split(",")[1] : result);
    };
    reader.readAsDataURL(file);
  });

  const { uploadMedia } = await graphqlFetch<{ uploadMedia: string }>(
    `mutation UploadMedia($base64: String!, $mimeType: String!, $folder: String!) {
       uploadMedia(base64: $base64, mimeType: $mimeType, folder: $folder)
     }`,
    { base64, mimeType: file.type, folder: CAMPAIGN_IMAGE_FOLDER },
  );
  return uploadMedia;
}
