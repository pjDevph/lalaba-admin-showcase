// GENERATED FILE — do not edit by hand.
// Regenerate with: node scripts/extract-backend-roles.mjs
// Source: LALABA_BE_DEV/src/**/*.resolver.ts (57 resolvers, 365 root fields)
//
// Every GraphQL root field the backend exposes, paired with the roleIds its
// @Roles guard admits. This is a snapshot of the security boundary, kept in
// the panel so capability-coverage.test.ts can assert the UI never offers
// more than the backend allows.

/** No auth guard at all — login, health, and similar. */
export const PUBLIC = null;
/** Guarded by auth but by no @Roles — any signed-in account may call it. */
export const ANY_AUTHENTICATED = "*" as const;

export type BackendRoles = readonly string[] | typeof ANY_AUTHENTICATED | typeof PUBLIC;

export const BACKEND_ROLES: Record<string, BackendRoles> = {
  "acceptOnlineOrder": ["merchant", "washer", "staff"], // mutation — src/online-orders/online-orders.resolver.ts:160
  "accountDeletionBlockers": ANY_AUTHENTICATED, // query — src/account-deletion/account-deletion.resolver.ts:29
  "accountDeletionQueue": ["admin", "support"], // query — src/account-deletion/account-deletion.resolver.ts:80
  "addFavorite": ["customer"], // mutation — src/favorites/favorites.resolver.ts:23
  "addMySupportTicketNote": ["customer", "washer", "merchant"], // mutation — src/support-tickets/my-support-tickets.resolver.ts:97
  "addOrderItems": ["merchant", "staff"], // mutation — src/pos_orders/pos-orders.resolver.ts:294
  "addSupportTicketNote": ["admin", "support"], // mutation — src/support-tickets/support-tickets.resolver.ts:100
  "adjustInventory": ["merchant", "staff"], // mutation — src/inventory/inventory.resolver.ts:144
  "adjustWalletBalance": ["admin"], // mutation — src/wallets/wallets-admin.resolver.ts:113
  "adminAuditLog": ["admin"], // query — src/admin-audit/admin-audit.resolver.ts:27
  "adminConversationMessages": ["admin", "support"], // query — src/chat/chat.resolver.ts:104
  "adminConversations": ["admin", "support"], // query — src/chat/chat.resolver.ts:96
  "adminOrders": ["admin", "support"], // query — src/online-orders/online-orders.resolver.ts:481
  "adminSendMessage": ["admin", "support"], // mutation — src/chat/chat.resolver.ts:118
  "adminTopUps": ["admin"], // query — src/wallets/wallets-admin.resolver.ts:91
  "adminWalletLedger": ["admin"], // query — src/wallets/wallets-admin.resolver.ts:80
  "adminWallets": ["admin"], // query — src/wallets/wallets-admin.resolver.ts:73
  "allInventoryTransactions": ["merchant", "staff"], // query — src/inventory/inventory.resolver.ts:105
  "allWasherServiceTemplates": ["admin"], // query — src/washer-service-templates/washer-service-templates.resolver.ts:28
  "approveDevice": ["merchant"], // mutation — src/devices/devices.resolver.ts:109
  "approveKycDocument": ["admin", "support"], // mutation — src/kyc/kyc.resolver.ts:128
  "archiveBranch": ["merchant"], // mutation — src/branches/branches.resolver.ts:87
  "archiveInventory": ["merchant", "staff"], // mutation — src/inventory/inventory.resolver.ts:176
  "archiveProduct": ["merchant", "staff"], // mutation — src/products/products.resolver.ts:110
  "archiveService": ["merchant", "staff"], // mutation — src/services/services.resolver.ts:85
  "archiveStaff": ["merchant", "washer"], // mutation — src/staff/staff.resolver.ts:63
  "arriveAtPickup": ["courier", "washer"], // mutation — src/online-orders/online-orders.resolver.ts:242
  "arriveAtReturn": ["courier", "washer"], // mutation — src/online-orders/online-orders.resolver.ts:394
  "assertReportExport": ANY_AUTHENTICATED, // query — src/analytics/analytics.resolver.ts:66
  "assignableCouriers": ["merchant", "washer", "staff"], // query — src/online-orders/online-orders.resolver.ts:117
  "assignPickupStaff": ["merchant", "washer", "staff"], // mutation — src/online-orders/online-orders.resolver.ts:211
  "assignReturnStaff": ["merchant", "washer", "staff"], // mutation — src/online-orders/online-orders.resolver.ts:375
  "assignSupportTicket": ["admin", "support"], // mutation — src/support-tickets/support-tickets.resolver.ts:149
  "availableWasherServiceTemplates": ["washer", "admin"], // query — src/washer-service-templates/washer-service-templates.resolver.ts:20
  "biometricLogin": ANY_AUTHENTICATED, // mutation — src/biometric/biometric.resolver.ts:67
  "blockDevice": ["merchant"], // mutation — src/devices/devices.resolver.ts:125
  "bookingAvailability": ["admin", "support"], // query — src/booking-availability/booking-availability.resolver.ts:90
  "bookingCampaignImpact": ["admin"], // query — src/booking-policy/booking-policy.resolver.ts:149
  "bookingCampaigns": ["admin"], // query — src/booking-policy/booking-policy.resolver.ts:125
  "bookingMilestones": ["admin", "washer", "merchant"], // query — src/booking-policy/booking-policy.resolver.ts:100
  "bookingPolicy": ["admin"], // query — src/booking-policy/booking-policy.resolver.ts:64
  "bookingPolicyHistory": ["admin"], // query — src/booking-policy/booking-policy.resolver.ts:70
  "bookingProviders": ["admin", "support"], // query — src/booking-availability/booking-availability.resolver.ts:78
  "bookingSpecialDates": ["admin", "support"], // query — src/booking-availability/booking-availability.resolver.ts:161
  "broadcastHistory": ["admin"], // query — src/notifications/broadcasts.resolver.ts:50
  "broadcastPreview": ["admin"], // query — src/notifications/broadcasts.resolver.ts:40
  "campaign": ["admin"], // query — src/campaigns/campaigns.resolver.ts:39
  "campaigns": ["admin"], // query — src/campaigns/campaigns.resolver.ts:34
  "cancelAccountDeletion": ANY_AUTHENTICATED, // mutation — src/account-deletion/account-deletion.resolver.ts:54
  "cancelAfterFailedPickup": ["customer"], // mutation — src/online-orders/online-orders.resolver.ts:308
  "cancelOnlineOrder": ["customer", "merchant", "washer", "staff"], // mutation — src/online-orders/online-orders.resolver.ts:199
  "cancelOrder": ["merchant", "staff"], // mutation — src/pos_orders/pos-orders.resolver.ts:256
  "certificationProofUrls": ["washer", "admin", "support"], // query — src/washer/washer-certification.resolver.ts:19
  "chooseReturnOption": ["customer"], // mutation — src/online-orders/online-orders.resolver.ts:362
  "claimCampaignOffer": ANY_AUTHENTICATED, // mutation — src/campaigns/campaigns.resolver.ts:121
  "claimDevice": ["merchant", "staff"], // mutation — src/devices/devices.resolver.ts:71
  "claimKycCase": ["admin", "support"], // mutation — src/kyc/kyc.resolver.ts:85
  "claimKycDocumentForReview": ["admin", "support"], // mutation — src/kyc/kyc.resolver.ts:115
  "closeMySupportTicket": ["customer", "washer", "merchant"], // mutation — src/support-tickets/my-support-tickets.resolver.ts:155
  "completeKycCaseReview": ["admin", "support"], // mutation — src/kyc/kyc.resolver.ts:159
  "completeTask": ["merchant", "staff"], // mutation — src/tasks/tasks.resolver.ts:98
  "confirmReturnedToProvider": ["merchant", "washer", "staff"], // mutation — src/online-orders/online-orders.resolver.ts:586
  "conversationMessages": ["customer", "merchant", "washer", "courier", "staff"], // query — src/chat/chat.resolver.ts:51
  "copyBookingDay": ["admin"], // mutation — src/booking-availability/booking-availability.resolver.ts:110
  "costingConfig": ANY_AUTHENTICATED, // query — src/costing/costing.resolver.ts:23
  "costingReports": ANY_AUTHENTICATED, // query — src/costing/costing.resolver.ts:50
  "countUsersByRole": ["admin", "support"], // query — src/users/users.resolver.ts:185
  "courierSelfieQueue": ["admin", "support"], // query — src/courier-verification/courier-verification.resolver.ts:61
  "createAddress": ["customer"], // mutation — src/addresses/addresses.resolver.ts:24
  "createAdminUser": ["admin"], // mutation — src/users/users.resolver.ts:98
  "createBookingBlackout": ["admin"], // mutation — src/booking-availability/booking-availability.resolver.ts:140
  "createBranch": ["merchant"], // mutation — src/branches/branches.resolver.ts:20
  "createCampaign": ["admin"], // mutation — src/campaigns/campaigns.resolver.ts:44
  "createInventory": ["merchant", "staff"], // mutation — src/inventory/inventory.resolver.ts:62
  "createMySupportTicket": ["customer", "washer", "merchant"], // mutation — src/support-tickets/my-support-tickets.resolver.ts:72
  "createOnlineOrder": ["customer"], // mutation — src/online-orders/online-orders.resolver.ts:151
  "createOrder": ["merchant", "staff"], // mutation — src/pos_orders/pos-orders.resolver.ts:53
  "createPermission": ["admin"], // mutation — src/permissions/permissions.resolver.ts:27
  "createPlatformFeeRule": ["admin"], // mutation — src/platform-fee/platform-fee.resolver.ts:108
  "createProduct": ["merchant", "staff"], // mutation — src/products/products.resolver.ts:70
  "createPromoCode": ["admin"], // mutation — src/promotions/promotions.resolver.ts:80
  "createRole": ["admin"], // mutation — src/roles/roles.resolver.ts:25
  "createService": ["merchant", "staff"], // mutation — src/services/services.resolver.ts:36
  "createSiteAnnouncement": ["admin"], // mutation — src/site-content/site-content.resolver.ts:166
  "createSiteFaqEntry": ["admin"], // mutation — src/site-content/site-content.resolver.ts:54
  "createSiteServiceArea": ["admin"], // mutation — src/site-content/site-content.resolver.ts:110
  "createStaff": ["merchant", "washer"], // mutation — src/staff/staff.resolver.ts:25
  "createSupportTicket": ["admin", "support"], // mutation — src/support-tickets/support-tickets.resolver.ts:92
  "createTask": ["merchant"], // mutation — src/tasks/tasks.resolver.ts:55
  "createWasherServiceTemplate": ["admin"], // mutation — src/washer-service-templates/washer-service-templates.resolver.ts:34
  "currentPlatformFeePercent": ["admin", "support", "merchant", "washer", "staff", "customer"], // query — src/platform-fee/platform-fee.resolver.ts:56
  "damageInventory": ["merchant", "staff"], // mutation — src/inventory/inventory.resolver.ts:160
  "deactivateUser": ["admin"], // mutation — src/users/users.resolver.ts:200
  "deleteAddress": ["customer"], // mutation — src/addresses/addresses.resolver.ts:49
  "deleteDevice": ["merchant"], // mutation — src/devices/devices.resolver.ts:141
  "deletePermission": ["admin"], // mutation — src/permissions/permissions.resolver.ts:93
  "deleteRole": ["admin"], // mutation — src/roles/roles.resolver.ts:121
  "deleteService": ["merchant", "staff"], // mutation — src/services/services.resolver.ts:111
  "deleteSiteAnnouncement": ["admin"], // mutation — src/site-content/site-content.resolver.ts:199
  "deleteSiteFaqEntry": ["admin"], // mutation — src/site-content/site-content.resolver.ts:87
  "deleteSiteServiceArea": ["admin"], // mutation — src/site-content/site-content.resolver.ts:143
  "deleteTask": ["merchant"], // mutation — src/tasks/tasks.resolver.ts:85
  "devicesByBranch": ["merchant"], // query — src/devices/devices.resolver.ts:101
  "directoryUser": ["admin", "support"], // query — src/directory/directory.resolver.ts:53
  "directoryUsers": ["admin", "support"], // query — src/directory/directory.resolver.ts:46
  "disapproveDevice": ["merchant"], // mutation — src/devices/devices.resolver.ts:117
  "discoverProviders": ["customer"], // query — src/discovery/discovery.resolver.ts:22
  "dismissRatingReport": ["admin", "support"], // mutation — src/ratings/ratings.resolver.ts:115
  "enrollBiometric": ANY_AUTHENTICATED, // mutation — src/biometric/biometric.resolver.ts:22
  "escalateToPickupReschedule": ["merchant", "washer", "staff"], // mutation — src/online-orders/online-orders.resolver.ts:290
  "generateStaffResetLink": ["merchant", "washer"], // mutation — src/staff/staff.resolver.ts:79
  "getBranch": ANY_AUTHENTICATED, // query — src/branches/branches.resolver.ts:42
  "getInventory": ["merchant", "staff"], // query — src/inventory/inventory.resolver.ts:86
  "getOrder": ["merchant", "staff"], // query — src/pos_orders/pos-orders.resolver.ts:95
  "getOrderByClaimCode": ["merchant", "staff"], // query — src/pos_orders/pos-orders.resolver.ts:106
  "getPermission": ["merchant", "staff"], // query — src/permissions/permissions.resolver.ts:79
  "getProduct": ["merchant", "staff"], // query — src/products/products.resolver.ts:91
  "getReceipt": ["merchant", "staff"], // query — src/pos_orders/pos-orders.resolver.ts:142
  "getRole": ["admin"], // query — src/roles/roles.resolver.ts:101
  "getService": ["merchant", "staff"], // query — src/services/services.resolver.ts:60
  "getStaff": ["merchant", "washer"], // query — src/staff/staff.resolver.ts:46
  "healthCheck": ANY_AUTHENTICATED, // query — src/app.resolver.ts:9
  "impersonateUser": ["admin"], // mutation — src/directory/directory.resolver.ts:73
  "incomingOnlineOrders": ["merchant", "washer", "staff"], // query — src/online-orders/online-orders.resolver.ts:102
  "initializeTopUp": ["merchant", "washer"], // mutation — src/wallets/wallets.resolver.ts:62
  "inventoryProducts": ["merchant", "staff"], // query — src/products/products.resolver.ts:80
  "inventoryTransactions": ["merchant", "staff"], // query — src/inventory/inventory.resolver.ts:94
  "kycAuditLog": ["admin", "support"], // query — src/kyc/kyc.resolver.ts:210
  "kycDocumentUrl": ["merchant", "washer", "admin", "support"], // query — src/kyc/kyc.resolver.ts:238
  "kycMetrics": ["admin", "support"], // query — src/kyc/kyc.resolver.ts:223
  "kycProviderDetail": ["admin", "support"], // query — src/kyc/kyc.resolver.ts:196
  "kycProviders": ["admin", "support"], // query — src/kyc/kyc.resolver.ts:183
  "kycReviewQueue": ["admin", "support"], // query — src/kyc/kyc.resolver.ts:66
  "listAdminPermissions": ["admin", "support"], // query — src/permissions/permissions.resolver.ts:73
  "listAdminUsers": ["admin", "support"], // query — src/users/users.resolver.ts:105
  "listMerchants": ["admin", "support"], // query — src/users/users.resolver.ts:175
  "listPermissions": ["merchant", "staff"], // query — src/permissions/permissions.resolver.ts:64
  "listRoles": ["admin"], // query — src/roles/roles.resolver.ts:80
  "listUsers": ["admin"], // query — src/users/users.resolver.ts:88
  "maintenanceConfig": ["admin", "support"], // query — src/maintenance/maintenance.resolver.ts:23
  "maintenanceStatus": ["customer", "merchant", "staff", "washer", "courier"], // query — src/maintenance/maintenance.resolver.ts:40
  "markAllNotificationsRead": ANY_AUTHENTICATED, // mutation — src/notifications/notifications-feed.resolver.ts:69
  "markCampaignClicked": ANY_AUTHENTICATED, // mutation — src/campaigns/campaigns.resolver.ts:137
  "markCampaignDismissed": ANY_AUTHENTICATED, // mutation — src/campaigns/campaigns.resolver.ts:145
  "markLaundryReady": ["merchant", "washer", "staff"], // mutation — src/online-orders/online-orders.resolver.ts:331
  "markMySupportTicketRead": ["customer", "washer", "merchant"], // mutation — src/support-tickets/my-support-tickets.resolver.ts:138
  "markNotificationRead": ANY_AUTHENTICATED, // mutation — src/notifications/notifications-feed.resolver.ts:60
  "markOrderInProgress": ["merchant", "staff"], // mutation — src/pos_orders/pos-orders.resolver.ts:179
  "markOrderReady": ["merchant", "staff"], // mutation — src/pos_orders/pos-orders.resolver.ts:192
  "maxServiceRadiusKm": ["admin", "support", "washer", "merchant"], // query — src/booking-policy/booking-policy.resolver.ts:91
  "me": ANY_AUTHENTICATED, // query — src/users/users.resolver.ts:67
  "moderateTakedown": ["admin", "support"], // mutation — src/ratings/ratings.resolver.ts:68
  "myActivityLogs": ANY_AUTHENTICATED, // query — src/activity-logs/activity-logs.resolver.ts:24
  "myAddresses": ["customer"], // query — src/addresses/addresses.resolver.ts:19
  "myAssignedOnlineOrders": ["courier", "washer"], // query — src/online-orders/online-orders.resolver.ts:126
  "myBiometricCredentials": ANY_AUTHENTICATED, // query — src/biometric/biometric.resolver.ts:31
  "myBookingAvailability": ["washer", "merchant", "admin"], // query — src/booking-availability/booking-availability.resolver.ts:175
  "myBookingEntitlement": ["washer", "merchant", "admin"], // query — src/booking-policy/booking-policy.resolver.ts:174
  "myBookingSpecialDates": ["washer", "merchant", "admin"], // query — src/booking-availability/booking-availability.resolver.ts:220
  "myBranches": ANY_AUTHENTICATED, // query — src/branches/branches.resolver.ts:31
  "myBranchOptions": ["merchant", "staff"], // query — src/devices/devices.resolver.ts:50
  "myConsents": ANY_AUTHENTICATED, // query — src/consents/consents.resolver.ts:16
  "myConversations": ["customer", "merchant", "washer", "courier", "staff"], // query — src/chat/chat.resolver.ts:42
  "myCourierSelfie": ["courier"], // query — src/courier-verification/courier-verification.resolver.ts:45
  "myDevice": ["merchant", "staff"], // query — src/devices/devices.resolver.ts:40
  "myDevices": ["merchant"], // query — src/devices/devices.resolver.ts:96
  "myEffectiveCommission": ["admin", "support", "merchant", "washer", "staff"], // query — src/platform-fee/platform-fee.resolver.ts:47
  "myFavorites": ["customer"], // query — src/favorites/favorites.resolver.ts:18
  "myInventory": ["merchant", "staff"], // query — src/inventory/inventory.resolver.ts:72
  "myKycStatus": ["merchant", "washer"], // query — src/kyc/kyc.resolver.ts:48
  "myMilestoneProgress": ["washer", "admin"], // query — src/booking-policy/booking-policy.resolver.ts:184
  "myNotifications": ANY_AUTHENTICATED, // query — src/notifications/notifications-feed.resolver.ts:30
  "myOnlineOrders": ["customer"], // query — src/online-orders/online-orders.resolver.ts:79
  "myOpenSupportTicket": ["customer", "washer", "merchant"], // query — src/support-tickets/my-support-tickets.resolver.ts:52
  "myOrders": ["merchant", "staff"], // query — src/pos_orders/pos-orders.resolver.ts:67
  "myOwner": ["merchant", "staff"], // query — src/devices/devices.resolver.ts:58
  "myPermissionGroups": ["merchant", "staff"], // query — src/permissions/permissions.resolver.ts:44
  "myProducts": ["merchant", "staff"], // query — src/products/products.resolver.ts:56
  "myProviderCard": ["washer", "merchant"], // query — src/discovery/discovery.resolver.ts:32
  "myProviderCards": ["washer", "merchant"], // query — src/discovery/discovery.resolver.ts:42
  "myProviderProfile": ["washer", "merchant"], // query — src/discovery/discovery.resolver.ts:50
  "myRatingForOrder": ["customer"], // query — src/ratings/ratings.resolver.ts:50
  "myServices": ["merchant", "staff"], // query — src/services/services.resolver.ts:46
  "myStaff": ["merchant", "washer"], // query — src/staff/staff.resolver.ts:37
  "mySupportTicketNotes": ["customer", "washer", "merchant"], // query — src/support-tickets/my-support-tickets.resolver.ts:61
  "myTasks": ["merchant", "staff"], // query — src/tasks/tasks.resolver.ts:38
  "myTransactions": ["merchant", "staff"], // query — src/pos_orders/pos-orders.resolver.ts:128
  "myUnreadNotificationCount": ANY_AUTHENTICATED, // query — src/notifications/notifications-feed.resolver.ts:52
  "myVouchers": ANY_AUTHENTICATED, // query — src/promotions/user-vouchers.resolver.ts:31
  "myWasherServiceOfferings": ["washer"], // query — src/washer-service-offerings/washer-service-offerings.resolver.ts:33
  "nextCampaign": ANY_AUTHENTICATED, // query — src/campaigns/campaigns.resolver.ts:101
  "notifyStaffLogin": ANY_AUTHENTICATED, // mutation — src/notifications/notifications.resolver.ts:47
  "nowQueue": ["admin", "support"], // query — src/now-queue/now-queue.resolver.ts:26
  "onlineOrder": ANY_AUTHENTICATED, // query — src/online-orders/online-orders.resolver.ts:85
  "onlineOrderTimeline": ANY_AUTHENTICATED, // query — src/online-orders/online-orders.resolver.ts:93
  "operationalContext": ["admin", "support"], // query — src/operational-context/operational-context.resolver.ts:29
  "orderDashboard": ["merchant", "washer", "staff"], // query — src/order-dashboard/order-dashboard.resolver.ts:19
  "orderHistory": ["merchant", "staff"], // query — src/pos_orders/pos-orders.resolver.ts:81
  "orderStatusOptions": ["admin", "support"], // query — src/online-orders/online-orders.resolver.ts:509
  "orderTransactions": ["merchant", "staff"], // query — src/pos_orders/pos-orders.resolver.ts:117
  "overrideOrderStatus": ["admin", "support"], // mutation — src/online-orders/online-orders.resolver.ts:524
  "pingPresence": ANY_AUTHENTICATED, // mutation — src/presence/presence.resolver.ts:17
  "platformFeeHistory": ["admin"], // query — src/platform-fee/platform-fee.resolver.ts:164
  "platformFeeRuleHistory": ["admin"], // query — src/platform-fee/platform-fee.resolver.ts:85
  "platformFeeRules": ["admin"], // query — src/platform-fee/platform-fee.resolver.ts:80
  "platformOverview": ["admin"], // query — src/platform-analytics/platform-analytics.resolver.ts:22
  "platformStatsToday": ["admin", "support"], // query — src/platform-fee/platform-fee.resolver.ts:72
  "presence": ANY_AUTHENTICATED, // query — src/presence/presence.resolver.ts:23
  "previewPlatformFeeRule": ["admin"], // query — src/platform-fee/platform-fee.resolver.ts:96
  "processPayment": ["merchant", "staff"], // mutation — src/pos_orders/pos-orders.resolver.ts:226
  "processPickup": ["merchant", "staff"], // mutation — src/pos_orders/pos-orders.resolver.ts:242
  "promoCode": ["admin"], // query — src/promotions/promotions.resolver.ts:56
  "promoCodes": ["admin"], // query — src/promotions/promotions.resolver.ts:49
  "promoUsageSummary": ["admin"], // query — src/promotions/promotions.resolver.ts:63
  "proposeOnlineOrderChange": ["merchant", "washer", "staff"], // mutation — src/online-orders/online-orders.resolver.ts:179
  "providerBookingCalendar": ANY_AUTHENTICATED, // query — src/booking-availability/booking-availability.resolver.ts:237
  "providerBookingDay": ANY_AUTHENTICATED, // query — src/booking-availability/booking-availability.resolver.ts:248
  "providerBookingEntitlement": ["admin"], // query — src/booking-policy/booking-policy.resolver.ts:197
  "providerPickupDays": ["customer"], // query — src/discovery/discovery.resolver.ts:88
  "providerProfile": ["customer", "merchant", "washer", "staff"], // query — src/discovery/discovery.resolver.ts:64
  "providerServices": ["customer", "washer", "merchant"], // query — src/discovery/discovery.resolver.ts:77
  "publicMaintenanceStatus": ANY_AUTHENTICATED, // query — src/maintenance/maintenance.resolver.ts:78
  "publishBookingPolicy": ["admin"], // mutation — src/booking-policy/booking-policy.resolver.ts:78
  "quoteOnlineOrder": ["customer"], // query — src/online-orders/online-orders.resolver.ts:140
  "raiseQualityHold": ["merchant", "washer", "staff"], // mutation — src/online-orders/online-orders.resolver.ts:340
  "ratingModerationQueue": ["admin", "support"], // query — src/ratings/ratings.resolver.ts:125
  "reactivateUser": ["admin"], // mutation — src/users/users.resolver.ts:233
  "reactivateWasher": ["admin"], // mutation — src/washer/washer-admin.resolver.ts:97
  "receiveOrderAtCounter": ["merchant", "washer", "staff"], // mutation — src/online-orders/online-orders.resolver.ts:319
  "recordDelivery": ["courier", "washer"], // mutation — src/online-orders/online-orders.resolver.ts:403
  "recordFailedDeliveryAttempt": ["courier", "washer"], // mutation — src/online-orders/online-orders.resolver.ts:414
  "recordFailedPickupAttempt": ["courier", "washer"], // mutation — src/online-orders/online-orders.resolver.ts:271
  "recordPickupPayment": ["courier", "washer"], // mutation — src/online-orders/online-orders.resolver.ts:261
  "recordPickupWeight": ["courier", "washer"], // mutation — src/online-orders/online-orders.resolver.ts:251
  "redeemPromoCode": ["admin"], // mutation — src/promotions/promotions.resolver.ts:143
  "registerDevice": ["merchant", "staff"], // mutation — src/devices/devices.resolver.ts:29
  "registerUser": ANY_AUTHENTICATED, // mutation — src/users/users.resolver.ts:43
  "reinstateAbandonedOrder": ["admin", "support"], // mutation — src/online-orders/online-orders.resolver.ts:558
  "rejectKycDocument": ["admin", "support"], // mutation — src/kyc/kyc.resolver.ts:141
  "rejectOnlineOrder": ["merchant", "washer", "staff"], // mutation — src/online-orders/online-orders.resolver.ts:169
  "releaseKycCase": ["admin", "support"], // mutation — src/kyc/kyc.resolver.ts:100
  "remindDeviceApproval": ["merchant", "staff"], // mutation — src/devices/devices.resolver.ts:84
  "removeBookingBlackout": ["admin"], // mutation — src/booking-availability/booking-availability.resolver.ts:151
  "removeBookingCampaign": ["admin"], // mutation — src/booking-policy/booking-policy.resolver.ts:140
  "removeBookingDateOverride": ["admin"], // mutation — src/booking-availability/booking-availability.resolver.ts:131
  "removeBookingMilestone": ["admin"], // mutation — src/booking-policy/booking-policy.resolver.ts:117
  "removeFavorite": ["customer"], // mutation — src/favorites/favorites.resolver.ts:33
  "removeFcmToken": ANY_AUTHENTICATED, // mutation — src/notifications/notifications.resolver.ts:31
  "removeServiceProductDefault": ["washer"], // mutation — src/washer-service-products/washer-service-products.resolver.ts:40
  "removeWasherServiceOffering": ["washer"], // mutation — src/washer-service-offerings/washer-service-offerings.resolver.ts:55
  "reportRating": ["customer", "merchant", "washer"], // mutation — src/ratings/ratings.resolver.ts:59
  "requestAccountDeletion": ANY_AUTHENTICATED, // mutation — src/account-deletion/account-deletion.resolver.ts:41
  "requestBiometricChallenge": ANY_AUTHENTICATED, // mutation — src/biometric/biometric.resolver.ts:58
  "rescheduleOrder": ["merchant", "staff"], // mutation — src/pos_orders/pos-orders.resolver.ts:205
  "reschedulePickup": ["customer"], // mutation — src/online-orders/online-orders.resolver.ts:299
  "resendAdminInvite": ["admin"], // mutation — src/users/users.resolver.ts:167
  "resolveSupportTicket": ["admin", "support"], // mutation — src/support-tickets/support-tickets.resolver.ts:171
  "respondToProviderChange": ["customer"], // mutation — src/online-orders/online-orders.resolver.ts:189
  "respondToQualityHold": ["customer"], // mutation — src/online-orders/online-orders.resolver.ts:350
  "respondToReview": ["merchant", "washer"], // mutation — src/ratings/ratings.resolver.ts:145
  "restockInventory": ["merchant", "staff"], // mutation — src/inventory/inventory.resolver.ts:128
  "restoreBranch": ["merchant"], // mutation — src/branches/branches.resolver.ts:97
  "restoreInventory": ["merchant", "staff"], // mutation — src/inventory/inventory.resolver.ts:186
  "restoreProduct": ["merchant", "staff"], // mutation — src/products/products.resolver.ts:120
  "restoreRating": ["admin", "support"], // mutation — src/ratings/ratings.resolver.ts:91
  "restoreService": ["merchant", "staff"], // mutation — src/services/services.resolver.ts:98
  "restoreStaff": ["merchant", "washer"], // mutation — src/staff/staff.resolver.ts:71
  "retryPickupSameDay": ["merchant", "washer", "staff"], // mutation — src/online-orders/online-orders.resolver.ts:281
  "revenueOverTime": ANY_AUTHENTICATED, // query — src/analytics/analytics.resolver.ts:47
  "revenueSummary": ANY_AUTHENTICATED, // query — src/analytics/analytics.resolver.ts:23
  "revenueSummaryByBranch": ANY_AUTHENTICATED, // query — src/analytics/analytics.resolver.ts:36
  "revokeBiometric": ANY_AUTHENTICATED, // mutation — src/biometric/biometric.resolver.ts:39
  "revokeCourierSelfie": ["admin", "support"], // mutation — src/courier-verification/courier-verification.resolver.ts:76
  "revokeMySessions": ANY_AUTHENTICATED, // mutation — src/users/users.resolver.ts:160
  "revokeUserSessions": ["admin"], // mutation — src/users/users.resolver.ts:124
  "runScheduledAccountDeletions": ["admin", "support"], // mutation — src/account-deletion/account-deletion.resolver.ts:94
  "saveFcmToken": ANY_AUTHENTICATED, // mutation — src/notifications/notifications.resolver.ts:19
  "scheduleRedelivery": ["customer", "merchant", "washer", "staff"], // mutation — src/online-orders/online-orders.resolver.ts:595
  "searchOperationalEntities": ["admin", "support"], // query — src/search/search.resolver.ts:28
  "seedPlatformFeeRules": ["admin"], // mutation — src/platform-fee/platform-fee.resolver.ts:156
  "sendBroadcast": ["admin"], // mutation — src/notifications/broadcasts.resolver.ts:60
  "sendMessage": ["customer", "merchant", "washer", "courier", "staff"], // mutation — src/chat/chat.resolver.ts:61
  "serviceProductSlots": ["washer", "customer"], // query — src/washer-service-products/washer-service-products.resolver.ts:58
  "setBranchOnline": ["merchant"], // mutation — src/branches/branches.resolver.ts:76
  "setDefaultAddress": ["customer"], // mutation — src/addresses/addresses.resolver.ts:41
  "setPayAtHandover": ["merchant", "washer"], // mutation — src/branches/branches.resolver.ts:65
  "setPlatformFee": ["admin"], // mutation — src/platform-fee/platform-fee.resolver.ts:170
  "setPlatformFeeRuleActive": ["admin"], // mutation — src/platform-fee/platform-fee.resolver.ts:135
  "setPromoCodeActive": ["admin"], // mutation — src/promotions/promotions.resolver.ts:117
  "setServiceProductDefault": ["washer"], // mutation — src/washer-service-products/washer-service-products.resolver.ts:30
  "setSupportTicketPriority": ["admin", "support"], // mutation — src/support-tickets/support-tickets.resolver.ts:162
  "setSupportTicketStatus": ["admin", "support"], // mutation — src/support-tickets/support-tickets.resolver.ts:135
  "setWasherDailyOrderCap": ["admin"], // mutation — src/washer/washer-admin.resolver.ts:31
  "setWasherServiceOffering": ["washer"], // mutation — src/washer-service-offerings/washer-service-offerings.resolver.ts:43
  "setWasherServiceTemplateActive": ["admin"], // mutation — src/washer-service-templates/washer-service-templates.resolver.ts:51
  "shopRatings": ["customer", "merchant", "washer", "admin", "support"], // query — src/ratings/ratings.resolver.ts:155
  "signupRoles": ANY_AUTHENTICATED, // query — src/roles/roles.resolver.ts:56
  "simulateBookingPolicy": ["admin"], // query — src/booking-policy/booking-policy.resolver.ts:163
  "siteAnnouncements": ["admin"], // query — src/site-content/site-content.resolver.ts:161
  "siteFaqEntries": ["admin"], // query — src/site-content/site-content.resolver.ts:49
  "siteServiceAreas": ["admin"], // query — src/site-content/site-content.resolver.ts:105
  "startConversation": ["customer"], // mutation — src/chat/chat.resolver.ts:128
  "startCourierConversation": ANY_AUTHENTICATED, // mutation — src/chat/chat.resolver.ts:139
  "startPickupRoute": ["courier", "washer"], // mutation — src/online-orders/online-orders.resolver.ts:233
  "startReturnRoute": ["courier", "washer"], // mutation — src/online-orders/online-orders.resolver.ts:385
  "submitCertificationProof": ["washer"], // mutation — src/washer/washer.resolver.ts:75
  "submitCourierSelfie": ["courier"], // mutation — src/courier-verification/courier-verification.resolver.ts:31
  "submitKycDocument": ["merchant", "washer"], // mutation — src/kyc/kyc.resolver.ts:35
  "submitRating": ["customer"], // mutation — src/ratings/ratings.resolver.ts:30
  "supportTicket": ["admin", "support"], // query — src/support-tickets/support-tickets.resolver.ts:57
  "supportTicketMetrics": ["admin", "support"], // query — src/support-tickets/support-tickets.resolver.ts:64
  "supportTickets": ["admin", "support"], // query — src/support-tickets/support-tickets.resolver.ts:50
  "suspendWasher": ["admin"], // mutation — src/washer/washer-admin.resolver.ts:67
  "toggleWasherAvailability": ["washer"], // mutation — src/washer/washer.resolver.ts:35
  "topUpHistory": ["merchant", "washer"], // query — src/wallets/wallets.resolver.ts:48
  "topUpStatus": ["merchant", "washer"], // query — src/wallets/wallets.resolver.ts:74
  "unblockDevice": ["merchant"], // mutation — src/devices/devices.resolver.ts:133
  "unsettledOrders": ["admin", "support"], // query — src/online-orders/online-orders.resolver.ts:493
  "updateAddress": ["customer"], // mutation — src/addresses/addresses.resolver.ts:32
  "updateBookingAvailability": ["admin"], // mutation — src/booking-availability/booking-availability.resolver.ts:99
  "updateBranch": ["merchant"], // mutation — src/branches/branches.resolver.ts:52
  "updateCampaign": ["admin"], // mutation — src/campaigns/campaigns.resolver.ts:63
  "updateCourierLocation": ["courier", "washer"], // mutation — src/online-orders/online-orders.resolver.ts:223
  "updateDevice": ["merchant"], // mutation — src/devices/devices.resolver.ts:149
  "updateInventory": ["merchant", "staff"], // mutation — src/inventory/inventory.resolver.ts:117
  "updateMaintenanceConfig": ["admin"], // mutation — src/maintenance/maintenance.resolver.ts:29
  "updateMyBookingCapacity": ["washer", "merchant"], // mutation — src/booking-availability/booking-availability.resolver.ts:185
  "updateMyFulfillmentPricing": ["washer", "merchant", "admin"], // mutation — src/booking-availability/booking-availability.resolver.ts:205
  "updateOrderDetails": ["merchant", "staff"], // mutation — src/pos_orders/pos-orders.resolver.ts:160
  "updatePermission": ["admin"], // mutation — src/permissions/permissions.resolver.ts:85
  "updatePlatformFeeRule": ["admin"], // mutation — src/platform-fee/platform-fee.resolver.ts:121
  "updateProduct": ["merchant", "staff"], // mutation — src/products/products.resolver.ts:99
  "updatePromoCode": ["admin"], // mutation — src/promotions/promotions.resolver.ts:100
  "updateRating": ["customer"], // mutation — src/ratings/ratings.resolver.ts:40
  "updateRole": ["admin"], // mutation — src/roles/roles.resolver.ts:108
  "updateService": ["merchant", "staff"], // mutation — src/services/services.resolver.ts:74
  "updateSiteAnnouncement": ["admin"], // mutation — src/site-content/site-content.resolver.ts:182
  "updateSiteFaqEntry": ["admin"], // mutation — src/site-content/site-content.resolver.ts:70
  "updateSiteServiceArea": ["admin"], // mutation — src/site-content/site-content.resolver.ts:126
  "updateStaff": ["merchant", "washer"], // mutation — src/staff/staff.resolver.ts:54
  "updateTask": ["merchant"], // mutation — src/tasks/tasks.resolver.ts:65
  "updateUser": ANY_AUTHENTICATED, // mutation — src/users/users.resolver.ts:79
  "updateWasherProfile": ["washer"], // mutation — src/washer/washer.resolver.ts:42
  "updateWasherServiceTemplate": ["admin"], // mutation — src/washer-service-templates/washer-service-templates.resolver.ts:42
  "uploadChatImage": ["customer", "merchant", "washer", "courier", "staff"], // mutation — src/chat/chat.resolver.ts:74
  "uploadHandoverProof": ["courier", "washer", "merchant", "staff"], // mutation — src/online-orders/online-orders.resolver.ts:433
  "uploadMedia": ["admin", "support", "merchant", "washer", "staff"], // mutation — src/media/media.resolver.ts:35
  "uploadMySupportTicketImage": ["customer", "washer", "merchant"], // mutation — src/support-tickets/my-support-tickets.resolver.ts:122
  "uploadSupportTicketImage": ["admin", "support"], // mutation — src/support-tickets/support-tickets.resolver.ts:120
  "upsertBookingCampaign": ["admin"], // mutation — src/booking-policy/booking-policy.resolver.ts:131
  "upsertBookingDateOverride": ["admin"], // mutation — src/booking-availability/booking-availability.resolver.ts:120
  "upsertBookingMilestone": ["admin"], // mutation — src/booking-policy/booking-policy.resolver.ts:108
  "upsertCostingConfig": ANY_AUTHENTICATED, // mutation — src/costing/costing.resolver.ts:35
  "upsertCostingReport": ANY_AUTHENTICATED, // mutation — src/costing/costing.resolver.ts:65
  "userConsents": ["admin", "support"], // query — src/consents/consents.resolver.ts:27
  "validatePromoCode": ["admin"], // query — src/promotions/promotions.resolver.ts:71
  "verifySelfPickup": ["merchant", "washer", "staff"], // mutation — src/online-orders/online-orders.resolver.ts:606
  "voidOrder": ["merchant", "staff"], // mutation — src/pos_orders/pos-orders.resolver.ts:275
  "walletLedger": ["merchant", "washer"], // query — src/wallets/wallets.resolver.ts:30
  "walletReconciliationReport": ["admin"], // query — src/wallets/wallets.resolver.ts:84
  "walletSummary": ["merchant", "washer"], // query — src/wallets/wallets.resolver.ts:21
  "walletThresholds": ["admin"], // query — src/wallets/wallets-admin.resolver.ts:103
  "washerProfile": ["washer"], // query — src/washer/washer.resolver.ts:30
  "washerReport": ["washer"], // query — src/washer/washer.resolver.ts:62
  "washerStats": ["washer"], // query — src/washer/washer.resolver.ts:50
};

/**
 * Root fields that are mutations rather than queries.
 *
 * The distinction matters to capability-coverage.test.ts: a query runs the
 * moment a page mounts, so every role that can open the page must be allowed
 * to call it. A mutation only runs when someone clicks the control that fires
 * it, and those are gated individually with <Can>.
 */
export const BACKEND_MUTATIONS: ReadonlySet<string> = new Set([
  "acceptOnlineOrder",
  "addFavorite",
  "addMySupportTicketNote",
  "addOrderItems",
  "addSupportTicketNote",
  "adjustInventory",
  "adjustWalletBalance",
  "adminSendMessage",
  "approveDevice",
  "approveKycDocument",
  "archiveBranch",
  "archiveInventory",
  "archiveProduct",
  "archiveService",
  "archiveStaff",
  "arriveAtPickup",
  "arriveAtReturn",
  "assignPickupStaff",
  "assignReturnStaff",
  "assignSupportTicket",
  "biometricLogin",
  "blockDevice",
  "cancelAccountDeletion",
  "cancelAfterFailedPickup",
  "cancelOnlineOrder",
  "cancelOrder",
  "chooseReturnOption",
  "claimCampaignOffer",
  "claimDevice",
  "claimKycCase",
  "claimKycDocumentForReview",
  "closeMySupportTicket",
  "completeKycCaseReview",
  "completeTask",
  "confirmReturnedToProvider",
  "copyBookingDay",
  "createAddress",
  "createAdminUser",
  "createBookingBlackout",
  "createBranch",
  "createCampaign",
  "createInventory",
  "createMySupportTicket",
  "createOnlineOrder",
  "createOrder",
  "createPermission",
  "createPlatformFeeRule",
  "createProduct",
  "createPromoCode",
  "createRole",
  "createService",
  "createSiteAnnouncement",
  "createSiteFaqEntry",
  "createSiteServiceArea",
  "createStaff",
  "createSupportTicket",
  "createTask",
  "createWasherServiceTemplate",
  "damageInventory",
  "deactivateUser",
  "deleteAddress",
  "deleteDevice",
  "deletePermission",
  "deleteRole",
  "deleteService",
  "deleteSiteAnnouncement",
  "deleteSiteFaqEntry",
  "deleteSiteServiceArea",
  "deleteTask",
  "disapproveDevice",
  "dismissRatingReport",
  "enrollBiometric",
  "escalateToPickupReschedule",
  "generateStaffResetLink",
  "impersonateUser",
  "initializeTopUp",
  "markAllNotificationsRead",
  "markCampaignClicked",
  "markCampaignDismissed",
  "markLaundryReady",
  "markMySupportTicketRead",
  "markNotificationRead",
  "markOrderInProgress",
  "markOrderReady",
  "moderateTakedown",
  "notifyStaffLogin",
  "overrideOrderStatus",
  "pingPresence",
  "processPayment",
  "processPickup",
  "proposeOnlineOrderChange",
  "publishBookingPolicy",
  "raiseQualityHold",
  "reactivateUser",
  "reactivateWasher",
  "receiveOrderAtCounter",
  "recordDelivery",
  "recordFailedDeliveryAttempt",
  "recordFailedPickupAttempt",
  "recordPickupPayment",
  "recordPickupWeight",
  "redeemPromoCode",
  "registerDevice",
  "registerUser",
  "reinstateAbandonedOrder",
  "rejectKycDocument",
  "rejectOnlineOrder",
  "releaseKycCase",
  "remindDeviceApproval",
  "removeBookingBlackout",
  "removeBookingCampaign",
  "removeBookingDateOverride",
  "removeBookingMilestone",
  "removeFavorite",
  "removeFcmToken",
  "removeServiceProductDefault",
  "removeWasherServiceOffering",
  "reportRating",
  "requestAccountDeletion",
  "requestBiometricChallenge",
  "rescheduleOrder",
  "reschedulePickup",
  "resendAdminInvite",
  "resolveSupportTicket",
  "respondToProviderChange",
  "respondToQualityHold",
  "respondToReview",
  "restockInventory",
  "restoreBranch",
  "restoreInventory",
  "restoreProduct",
  "restoreRating",
  "restoreService",
  "restoreStaff",
  "retryPickupSameDay",
  "revokeBiometric",
  "revokeCourierSelfie",
  "revokeMySessions",
  "revokeUserSessions",
  "runScheduledAccountDeletions",
  "saveFcmToken",
  "scheduleRedelivery",
  "seedPlatformFeeRules",
  "sendBroadcast",
  "sendMessage",
  "setBranchOnline",
  "setDefaultAddress",
  "setPayAtHandover",
  "setPlatformFee",
  "setPlatformFeeRuleActive",
  "setPromoCodeActive",
  "setServiceProductDefault",
  "setSupportTicketPriority",
  "setSupportTicketStatus",
  "setWasherDailyOrderCap",
  "setWasherServiceOffering",
  "setWasherServiceTemplateActive",
  "startConversation",
  "startCourierConversation",
  "startPickupRoute",
  "startReturnRoute",
  "submitCertificationProof",
  "submitCourierSelfie",
  "submitKycDocument",
  "submitRating",
  "suspendWasher",
  "toggleWasherAvailability",
  "unblockDevice",
  "updateAddress",
  "updateBookingAvailability",
  "updateBranch",
  "updateCampaign",
  "updateCourierLocation",
  "updateDevice",
  "updateInventory",
  "updateMaintenanceConfig",
  "updateMyBookingCapacity",
  "updateMyFulfillmentPricing",
  "updateOrderDetails",
  "updatePermission",
  "updatePlatformFeeRule",
  "updateProduct",
  "updatePromoCode",
  "updateRating",
  "updateRole",
  "updateService",
  "updateSiteAnnouncement",
  "updateSiteFaqEntry",
  "updateSiteServiceArea",
  "updateStaff",
  "updateTask",
  "updateUser",
  "updateWasherProfile",
  "updateWasherServiceTemplate",
  "uploadChatImage",
  "uploadHandoverProof",
  "uploadMedia",
  "uploadMySupportTicketImage",
  "uploadSupportTicketImage",
  "upsertBookingCampaign",
  "upsertBookingDateOverride",
  "upsertBookingMilestone",
  "upsertCostingConfig",
  "upsertCostingReport",
  "verifySelfPickup",
  "voidOrder",
]);
