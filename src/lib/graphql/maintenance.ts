import { graphqlFetch } from "@/lib/api-client";

// Platform-wide maintenance kill switch (LALABA_BE_DEV/src/maintenance).
// Single fixed-key config, no draft/publish/version flow — Save takes effect
// immediately. Two independently-targetable apps (Customer, Partner/Washer —
// the latter serves merchant/staff/washer/courier roles from one codebase),
// plus a Global Emergency master override that blocks both regardless of
// their own settings.

export type MaintenanceMode = "SCHEDULED" | "EMERGENCY";

export type MaintenanceAppState = {
  active: boolean;
  mode: MaintenanceMode;
  message: string | null;
  scheduledStart: string | null;
  scheduledEnd: string | null;
};

export type MaintenanceConfig = {
  _id: string;
  globalEmergencyActive: boolean;
  globalEmergencyMessage: string | null;
  customerApp: MaintenanceAppState;
  partnerApp: MaintenanceAppState;
  /** Where a blocked person can turn. Shown by both apps as a real action. */
  supportEmail: string | null;
  supportPhone: string | null;
  bypassUids: string[];
};

export type UpdateMaintenanceAppStateInput = {
  active: boolean;
  mode: MaintenanceMode;
  message?: string | null;
  scheduledStart?: string | null;
  scheduledEnd?: string | null;
};

export type UpdateMaintenanceConfigInput = {
  globalEmergencyActive: boolean;
  globalEmergencyMessage?: string | null;
  customerApp: UpdateMaintenanceAppStateInput;
  partnerApp: UpdateMaintenanceAppStateInput;
  supportEmail?: string | null;
  supportPhone?: string | null;
  bypassUids: string[];
};

const APP_STATE_FIELDS = `
  active
  mode
  message
  scheduledStart
  scheduledEnd
`;

const CONFIG_FIELDS = `
  _id
  globalEmergencyActive
  globalEmergencyMessage
  customerApp { ${APP_STATE_FIELDS} }
  partnerApp { ${APP_STATE_FIELDS} }
  supportEmail
  supportPhone
  bypassUids
`;

export async function getMaintenanceConfig(): Promise<MaintenanceConfig> {
  const { maintenanceConfig } = await graphqlFetch<{
    maintenanceConfig: MaintenanceConfig;
  }>(`query MaintenanceConfig { maintenanceConfig { ${CONFIG_FIELDS} } }`);
  return maintenanceConfig;
}

export async function updateMaintenanceConfig(
  input: UpdateMaintenanceConfigInput,
): Promise<MaintenanceConfig> {
  const { updateMaintenanceConfig } = await graphqlFetch<{
    updateMaintenanceConfig: MaintenanceConfig;
  }>(
    `mutation UpdateMaintenanceConfig($input: UpdateMaintenanceConfigInput!) {
       updateMaintenanceConfig(input: $input) { ${CONFIG_FIELDS} }
     }`,
    { input },
  );
  return updateMaintenanceConfig;
}
