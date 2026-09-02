import { graphqlFetch } from "@/lib/api-client";

/**
 * CONVERSATIONS OVERSIGHT — visibility into existing customer<->provider and
 * customer<->courier chat threads, plus one narrow write path.
 *
 * This is NOT a support-ticket system: there is no queue, no assignment.
 * `adminSendMessage` lets an admin or support agent (`chat:takeover`) join a
 * thread as a THIRD PARTY, rendered with its own `support` senderRole
 * rather than being folded
 * into customer/merchant/washer/courier — a support reply is neither of the
 * two people already in the thread, and mislabeling it as one would confuse
 * whichever side didn't send it. It reuses the same Conversation/Message
 * schema the apps chat on, via the adminConversations/
 * adminConversationMessages/adminSendMessage operations.
 */

export type ConversationKind = "provider" | "courier";
export type ChatLegType = "pickup" | "return";
export type ProviderType = "MERCHANT" | "WASHER";
export type ChatSenderRole =
  | "customer"
  | "merchant"
  | "washer"
  | "courier"
  | "support";

export interface ConversationRow {
  _id: string;
  customerUid: string;
  customerName: string;
  providerUid: string;
  branchId: string;
  providerType: ProviderType;
  providerName: string;
  kind: ConversationKind;
  legType: ChatLegType | null;
  orderId: string | null;
  lastMessageText: string | null;
  lastMessageAt: string | null;
  customerUnread: number;
  providerUnread: number;
  createdAt: string | null;
}

export interface ConversationMessage {
  _id: string;
  conversationId: string;
  senderUid: string;
  senderRole: ChatSenderRole;
  text: string;
  createdAt: string;
}

export interface PaginatedConversations {
  data: ConversationRow[];
  total: number;
  limit: number;
  offset: number;
}

const CONVERSATION_FIELDS = `
  _id
  customerUid
  customerName
  providerUid
  branchId
  providerType
  providerName
  kind
  legType
  orderId
  lastMessageText
  lastMessageAt
  customerUnread
  providerUnread
  createdAt
`;

const ADMIN_CONVERSATIONS_QUERY = `
  query AdminConversations($input: AdminConversationsInput) {
    adminConversations(input: $input) {
      data { ${CONVERSATION_FIELDS} }
      total
      limit
      offset
    }
  }
`;

export async function listAdminConversations(filter: {
  search?: string;
  limit: number;
  offset: number;
}): Promise<PaginatedConversations> {
  const { adminConversations } = await graphqlFetch<{
    adminConversations: PaginatedConversations;
  }>(ADMIN_CONVERSATIONS_QUERY, { input: filter });
  return adminConversations;
}

const ADMIN_MESSAGES_QUERY = `
  query AdminConversationMessages($conversationId: ID!) {
    adminConversationMessages(conversationId: $conversationId) {
      _id
      conversationId
      senderUid
      senderRole
      text
      createdAt
    }
  }
`;

export async function listAdminConversationMessages(
  conversationId: string,
): Promise<ConversationMessage[]> {
  const { adminConversationMessages } = await graphqlFetch<{
    adminConversationMessages: ConversationMessage[];
  }>(ADMIN_MESSAGES_QUERY, { conversationId });
  return adminConversationMessages;
}

const ADMIN_SEND_MESSAGE_MUTATION = `
  mutation AdminSendMessage($conversationId: ID!, $text: String!) {
    adminSendMessage(conversationId: $conversationId, text: $text) {
      _id
      conversationId
      senderUid
      senderRole
      text
      createdAt
    }
  }
`;

export async function adminSendMessage(
  conversationId: string,
  text: string,
): Promise<ConversationMessage> {
  const { adminSendMessage } = await graphqlFetch<{
    adminSendMessage: ConversationMessage;
  }>(ADMIN_SEND_MESSAGE_MUTATION, { conversationId, text });
  return adminSendMessage;
}
