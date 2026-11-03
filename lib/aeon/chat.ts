// Conversations with Aeon, saved in practice_os.conversations and chat_messages.
// A crisis or refused message is answered and stored nowhere: no conversation
// row, no message row (her text was never accepted). Only an answered exchange
// is saved, and both sides of it have passed the sensitive-info guard.
import type { ApprovalMode } from "../approval-policy";
import { loadApprovalSettings } from "../approval-settings";
import { db } from "../db";
import { respond, type RespondOptions, type Reply, type Step, type Turn } from "./agent";
import { safeTitle, shownTitle } from "./chat-title";
import { contextSuffix, MAX_PICKED, tabLabel, type AskContext } from "../referrals/ask-context";
import { isSuppressed, suppressedList } from "../referrals/contacts";
import { isSensitiveSource } from "../referrals/sensitive";
import { listSources } from "../referrals/store";

/**
 * The partners she picked, as her board has them: ids the board doesn't know, sensitive
 * organizations and her do-not-contact list are dropped, and each name is the stored one
 * (never the name the browser sent). In the order picked, each once.
 */
export async function resolvePicked(picked: { id: string }[]): Promise<{ id: string; name: string }[]> {
  if (!picked.length) return [];
  const [cards, blocked] = await Promise.all([listSources(), suppressedList()]);
  const byId = new Map(cards.map((c) => [c.id, c]));
  const out: { id: string; name: string }[] = [];
  for (const p of picked) {
    const c = byId.get(p.id);
    if (!c || out.some((o) => o.id === c.id)) continue;
    if (c.sensitive || isSensitiveSource(c) || isSuppressed(c, blocked)) continue;
    out.push({ id: c.id, name: c.name });
    if (out.length >= MAX_PICKED) break;
  }
  return out;
}

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

/**
 * Saved titles are checked again as they are read (lib/aeon/chat-title.ts): plain
 * code only, no name-finder, at most READ_LIMIT rows, so the menu never waits on it.
 */
const READ_LIMIT = 100;
function withShownTitles(rows: Conversation[]): Conversation[] {
  return rows.slice(0, READ_LIMIT).map((row) => ({ ...row, title: shownTitle(row.title) }));
}

export async function listConversations(limit = 50): Promise<Conversation[]> {
  const capped = Math.min(Math.max(1, limit), READ_LIMIT);
  return withShownTitles(await db()<Conversation[]>`select * from practice_os.conversations order by updated_at desc limit ${capped}`);
}

export async function getConversation(id: string): Promise<{ conversation: Conversation; messages: ChatMessage[] } | null> {
  const sql = db();
  const [conversation] = await sql<Conversation[]>`select * from practice_os.conversations where id = ${id}`;
  if (!conversation) return null;
  conversation.title = shownTitle(conversation.title);
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
  /**
   * Where she asked from (the Referrals Ask Aeon box): added under her words for the model only
   * (lib/referrals/ask-context.ts). Her saved message and the chat's title are her words alone.
   */
  context?: AskContext;
  /** What Aeon is doing right now ("Checking 3 partners' public listings"), for a progress line. */
  onProgress?: RespondOptions["onProgress"];
}): Promise<{ conversationId: string | null; reply: Reply }> {
  const existing = input.conversationId ? await getConversation(input.conversationId) : null;
  if (input.conversationId && !existing) throw new Error("No conversation with that id.");
  const history: Turn[] = existing?.messages.map((m) => ({ role: m.role, content: m.content })) ?? [];

  // The mode she picked, else this chat's own, else the default. The view-only demo never acts.
  const mode: ApprovalMode = input.viewOnly
    ? "manual"
    : (input.mode ?? existing?.conversation.approval_mode ?? (await loadApprovalSettings()).mode);

  // Tools record who asked: the conversation when there is one, "chat:new" for its first message.
  // The context line is built here from her board, never from the names the browser sent.
  const context = input.context ? contextSuffix(tabLabel(input.context.tab), await resolvePicked(input.context.picked)) : undefined;
  const reply = await respond(input.text, {
    context,
    history,
    by: `chat:${existing?.conversation.id ?? "new"}`,
    viewOnly: input.viewOnly,
    mode,
    chat: input.chat,
    onProgress: input.onProgress,
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
  // The title's verdict is stored as the title: a refused first message saves as "New chat".
  // Checked before the transaction, because the name-finder can take a moment.
  const title = input.conversationId ? null : await safeTitle(input.text);
  return sql.begin(async (tx) => {
    let id = input.conversationId ?? undefined;
    if (!id) {
      const [row] = await tx<{ id: string }[]>`
        insert into practice_os.conversations (title, approval_mode) values (${title}, ${input.mode ?? null}) returning id`;
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
