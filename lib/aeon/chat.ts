// Conversations with Aeon, saved in practice_os.conversations and chat_messages.
// A crisis or refused message is answered and stored nowhere: no conversation
// row, no message row (her text was never accepted). Only an answered exchange
// is saved, and both sides of it have passed the sensitive-info guard.
import type { ApprovalMode } from "../approval-policy";
import { loadApprovalSettings } from "../approval-settings";
import { db } from "../db";
import { respond, type RespondOptions, type Reply, type Step, type Turn } from "./agent";

export type Conversation = {
  id: string;
  title: string;
  is_sample: boolean;
  /** Its own mode from the picker under the chat box; null = the default in Settings. */
  approval_mode: ApprovalMode | null;
  created_at: Date;
  updated_at: Date;
};
export type ChatMessage = {
  id: number;
  conversation_id: string;
  role: "clinician" | "aeon";
  content: string;
  steps: Step[];
  approval_ids: string[];
  created_at: Date;
};

const TITLE_CHARS = 60;

function titleFrom(text: string): string {
  const clean = text.trim().replace(/\s+/g, " ");
  return clean.length <= TITLE_CHARS ? clean : `${clean.slice(0, TITLE_CHARS - 1).trimEnd()}…`;
}

export async function listConversations(limit = 50): Promise<Conversation[]> {
  return db()<Conversation[]>`select * from practice_os.conversations order by updated_at desc limit ${limit}`;
}

export async function getConversation(id: string): Promise<{ conversation: Conversation; messages: ChatMessage[] } | null> {
  const sql = db();
  const [conversation] = await sql<Conversation[]>`select * from practice_os.conversations where id = ${id}`;
  if (!conversation) return null;
  const messages = await sql<ChatMessage[]>`
    select * from practice_os.chat_messages where conversation_id = ${id} order by id`;
  return { conversation, messages };
}

export async function deleteConversation(id: string): Promise<boolean> {
  const rows = await db()`delete from practice_os.conversations where id = ${id} returning id`;
  return rows.length > 0;
}

/**
 * Sends one message to Aeon. Returns Aeon's reply and the conversation it was
 * saved in (a new one when conversationId is missing), or null when nothing
 * was saved (crisis or refused).
 */
export async function sendMessage(input: {
  conversationId?: string | null;
  text: string;
  viewOnly?: boolean;
  /** The mode showing under the chat box when she sent it. */
  mode?: ApprovalMode;
  chat?: RespondOptions["chat"];
}): Promise<{ conversationId: string | null; reply: Reply }> {
  const existing = input.conversationId ? await getConversation(input.conversationId) : null;
  if (input.conversationId && !existing) throw new Error("No conversation with that id.");
  const history: Turn[] = existing?.messages.map((m) => ({ role: m.role, content: m.content })) ?? [];

  // The mode she picked, else this chat's own, else the default. The view-only demo never acts.
  const mode: ApprovalMode = input.viewOnly
    ? "manual"
    : (input.mode ?? existing?.conversation.approval_mode ?? (await loadApprovalSettings()).mode);

  // Tools record who asked: the conversation when there is one, "chat:new" for its first message.
  const reply = await respond(input.text, {
    history,
    by: `chat:${existing?.conversation.id ?? "new"}`,
    viewOnly: input.viewOnly,
    mode,
    chat: input.chat,
  });
  if (reply.kind !== "answer") return { conversationId: existing?.conversation.id ?? null, reply };

  const conversationId = await saveExchange({
    conversationId: existing?.conversation.id ?? null,
    text: input.text,
    reply,
    mode: input.mode,
    viewOnly: input.viewOnly,
  });
  return { conversationId, reply };
}

/**
 * Saves one exchange: her message and Aeon's answer, in a new conversation when
 * there is none yet. Both sides have already passed the sensitive-info guard.
 */
export async function saveExchange(input: {
  conversationId: string | null;
  text: string;
  reply: { text: string; steps: Step[]; approvalIds: string[] };
  mode?: ApprovalMode;
  viewOnly?: boolean;
}): Promise<string> {
  const { reply } = input;
  const sql = db();
  return sql.begin(async (tx) => {
    let id = input.conversationId ?? undefined;
    if (!id) {
      const [row] = await tx<{ id: string }[]>`
        insert into practice_os.conversations (title, approval_mode) values (${titleFrom(input.text)}, ${input.mode ?? null}) returning id`;
      id = row.id;
    } else {
      await tx`update practice_os.conversations set updated_at = now(), approval_mode = coalesce(${input.mode ?? null}, approval_mode) where id = ${id}`;
    }
    await tx`
      insert into practice_os.chat_messages (conversation_id, role, content)
      values (${id}, 'clinician', ${input.text.trim()})`;
    const [last] = await tx<{ id: string }[]>`
      insert into practice_os.chat_messages (conversation_id, role, content, steps, approval_ids)
      values (${id}, 'aeon', ${reply.text}, ${tx.json(reply.steps as never)}, ${reply.approvalIds}::uuid[])
      returning id`;
    // Demo visitors on the view-only copy can't change saved data, memory included:
    // their messages are marked as already reflected, so Aeon never learns from them.
    if (input.viewOnly) {
      await tx`update practice_os.conversations set reflected_through = ${last.id}, reflected_at = now() where id = ${id}`;
    }
    return id;
  });
}
