import {
  attachReportToMessageAction,
  createChatMessageAction,
} from "@/app/actions";
import type { MediaAttachment } from "@/lib/attachments";
import {
  getDataServerSnapshot,
  getDataSnapshot,
  replaceData,
  subscribeData,
} from "@/lib/client-store";
import { ROLE_LABELS, type TeamRole } from "@/lib/team";

export type ChatMessageSource = "typed" | "voice";
export type ChatAuthorRole = TeamRole | "signed_in";

export type ChatMessage = {
  id: string;
  channelId: string;
  authorId: string;
  authorName: string;
  authorRole: ChatAuthorRole;
  text: string;
  source: ChatMessageSource;
  attachments: MediaAttachment[];
  createdAt: string;
  reportId: string | null;
};

export type NewChatMessage = Omit<ChatMessage, "id" | "createdAt" | "reportId"> & {
  reportId?: string | null;
};

export const TEAM_CHANNEL_ID = "team";

export const AUTHOR_ROLE_LABELS: Record<ChatAuthorRole, string> = {
  ...ROLE_LABELS,
  signed_in: "Signed-in user",
};

// Chat messages live in data/chat-messages.json. The client store mirrors the server data.

export function getChatMessages(): ChatMessage[] {
  return getDataSnapshot().chatMessages;
}

export function getMessagesForChannel(channelId: string): ChatMessage[] {
  return getChatMessages().filter((message) => message.channelId === channelId);
}

export function subscribeToChatMessages(listener: () => void): () => void {
  return subscribeData(listener);
}

export function getChatMessageSnapshot(): ChatMessage[] {
  return getDataSnapshot().chatMessages;
}

export function getChatServerSnapshot(): ChatMessage[] {
  return getDataServerSnapshot().chatMessages;
}

export async function saveChatMessage(input: NewChatMessage): Promise<ChatMessage> {
  const created = await createChatMessageAction(input);
  replaceData("chatMessages", [...getDataSnapshot().chatMessages, created]);
  return created;
}

export async function attachReportToMessage(
  messageId: string,
  reportId: string,
): Promise<ChatMessage | null> {
  const updated = await attachReportToMessageAction(messageId, reportId);
  if (updated) {
    replaceData(
      "chatMessages",
      getDataSnapshot().chatMessages.map((message) =>
        message.id === updated.id ? updated : message,
      ),
    );
  }
  return updated;
}
