import { Prisma, type PrismaClient } from "@prisma/client";
import type {
  DirectorySearchFilters,
  MessageSearchFilters,
} from "@modules/search/dto/SearchDto.js";
import type {
  ConversationSearchRow,
  GroupSearchRow,
  ISearchRepository,
  MessageSearchRow,
  UserSearchRow,
} from "@modules/search/interfaces/ISearchRepository.js";
import { SearchMapper } from "@modules/search/mapper/SearchMapper.js";
import {
  decodeSearchCursor,
  toPrefixTsQuery,
} from "@modules/search/validators/SearchValidators.js";

type TsMode = "websearch" | "prefix";

function resolveTsMode(q: string): { mode: TsMode; expression: string } {
  if (/"/.test(q)) {
    return { mode: "websearch", expression: q };
  }
  const prefix = toPrefixTsQuery(q);
  if (!prefix) {
    return { mode: "websearch", expression: q };
  }
  return { mode: "prefix", expression: prefix };
}

function tsQuerySql(mode: TsMode, value: string): Prisma.Sql {
  if (mode === "websearch") {
    return Prisma.sql`websearch_to_tsquery('english', ${value})`;
  }
  return Prisma.sql`to_tsquery('english', ${value})`;
}

/**
 * Search repository — PostgreSQL FTS via GIN / tsvector. No Prisma N+1.
 */
export class SearchRepository implements ISearchRepository {
  constructor(protected readonly prisma: PrismaClient) {}

  async isActiveMember(
    userId: string,
    conversationId: string
  ): Promise<boolean> {
    const row = await this.prisma.conversationMember.findFirst({
      where: {
        userId,
        conversationId,
        leftAt: null,
        deletedAt: null,
        conversation: { deletedAt: null },
      },
      select: { id: true },
    });
    return Boolean(row);
  }

  async searchMessages(
    viewerId: string,
    filters: MessageSearchFilters
  ): Promise<MessageSearchRow[]> {
    const { mode, expression } = resolveTsMode(filters.q);
    const tsq = tsQuerySql(mode, expression);
    const take = filters.limit + 1;

    const conditions: Prisma.Sql[] = [
      Prisma.sql`m."deletedAt" IS NULL`,
      Prisma.sql`c."deletedAt" IS NULL`,
      Prisma.sql`u."deletedAt" IS NULL`,
      Prisma.sql`m."searchVector" @@ ${tsq}`,
      Prisma.sql`EXISTS (
        SELECT 1 FROM "conversation_members" cm
        WHERE cm."conversationId" = m."conversationId"
          AND cm."userId" = ${viewerId}
          AND cm."leftAt" IS NULL
          AND cm."deletedAt" IS NULL
      )`,
    ];

    if (filters.conversationId) {
      conditions.push(Prisma.sql`m."conversationId" = ${filters.conversationId}`);
    }
    if (filters.senderId) {
      conditions.push(Prisma.sql`m."senderId" = ${filters.senderId}`);
    }

    if (filters.messageType) {
      conditions.push(
        Prisma.sql`m."type" = ${SearchMapper.messageTypeToPrisma(filters.messageType)}::"MessageType"`
      );
    } else if (!filters.includeSystem) {
      // Default searchable set: TEXT + LINK (+ SYSTEM when includeSystem)
      conditions.push(
        Prisma.sql`m."type" IN ('TEXT'::"MessageType", 'LINK'::"MessageType")`
      );
    } else {
      conditions.push(
        Prisma.sql`m."type" IN ('TEXT'::"MessageType", 'LINK'::"MessageType", 'SYSTEM'::"MessageType")`
      );
    }

    if (filters.dateFrom) {
      conditions.push(Prisma.sql`m."createdAt" >= ${filters.dateFrom}`);
    }
    if (filters.dateTo) {
      conditions.push(Prisma.sql`m."createdAt" <= ${filters.dateTo}`);
    }
    if (filters.hasAttachments) {
      conditions.push(Prisma.sql`EXISTS (
        SELECT 1 FROM "attachments" a
        WHERE a."messageId" = m."id" AND a."deletedAt" IS NULL
      )`);
    }
    if (filters.hasLinks) {
      conditions.push(
        Prisma.sql`(m."type" = 'LINK'::"MessageType" OR m."linkPreview" IS NOT NULL)`
      );
    }

    if (filters.cursor) {
      const cur = decodeSearchCursor(filters.cursor);
      const createdAt = new Date(cur.createdAt);
      if (filters.sort === "oldest") {
        conditions.push(
          Prisma.sql`(m."createdAt", m."id") > (${createdAt}, ${cur.id})`
        );
      } else if (filters.sort === "newest") {
        conditions.push(
          Prisma.sql`(m."createdAt", m."id") < (${createdAt}, ${cur.id})`
        );
      } else {
        const rank = cur.rank ?? 0;
        conditions.push(Prisma.sql`(
          ts_rank(m."searchVector", ${tsq}) < ${rank}
          OR (
            ts_rank(m."searchVector", ${tsq}) = ${rank}
            AND (m."createdAt", m."id") < (${createdAt}, ${cur.id})
          )
        )`);
      }
    }

    const whereSql = Prisma.join(conditions, " AND ");

    let orderSql: Prisma.Sql;
    if (filters.sort === "oldest") {
      orderSql = Prisma.sql`m."createdAt" ASC, m."id" ASC`;
    } else if (filters.sort === "newest") {
      orderSql = Prisma.sql`m."createdAt" DESC, m."id" DESC`;
    } else {
      orderSql = Prisma.sql`rank DESC, m."createdAt" DESC, m."id" DESC`;
    }

    const rows = await this.prisma.$queryRaw<
      Array<{
        id: string;
        conversationId: string;
        senderId: string;
        type: string;
        content: string;
        snippet: string;
        createdAt: Date;
        rank: number | null;
      }>
    >(Prisma.sql`
      SELECT
        m."id",
        m."conversationId",
        m."senderId",
        m."type"::text AS "type",
        m."content",
        ts_headline(
          'english',
          m."content",
          ${tsq},
          'StartSel=<mark>, StopSel=</mark>, MaxFragments=2, MaxWords=20, MinWords=8'
        ) AS "snippet",
        m."createdAt",
        ts_rank(m."searchVector", ${tsq})::float8 AS "rank"
      FROM "messages" m
      INNER JOIN "conversations" c ON c."id" = m."conversationId"
      INNER JOIN "users" u ON u."id" = m."senderId"
      WHERE ${whereSql}
      ORDER BY ${orderSql}
      LIMIT ${take}
    `);

    return rows.map((r) => ({
      id: r.id,
      conversationId: r.conversationId,
      senderId: r.senderId,
      type: r.type.toLowerCase(),
      content: r.content,
      snippet: r.snippet,
      createdAt: r.createdAt.toISOString(),
      rank: r.rank,
      createdAtDate: r.createdAt,
      rankValue: r.rank,
    }));
  }

  async searchUsers(
    _viewerId: string,
    filters: DirectorySearchFilters
  ): Promise<UserSearchRow[]> {
    const { mode, expression } = resolveTsMode(filters.q);
    const tsq = tsQuerySql(mode, expression);
    const take = filters.limit + 1;
    const vector = Prisma.sql`to_tsvector('english', coalesce(u."name", '') || ' ' || coalesce(u."email", ''))`;

    const conditions: Prisma.Sql[] = [
      Prisma.sql`u."deletedAt" IS NULL`,
      Prisma.sql`${vector} @@ ${tsq}`,
    ];

    if (filters.cursor) {
      const cur = decodeSearchCursor(filters.cursor);
      const createdAt = new Date(cur.createdAt);
      if (filters.sort === "oldest") {
        conditions.push(
          Prisma.sql`(u."createdAt", u."id") > (${createdAt}, ${cur.id})`
        );
      } else if (filters.sort === "newest") {
        conditions.push(
          Prisma.sql`(u."createdAt", u."id") < (${createdAt}, ${cur.id})`
        );
      } else {
        const rank = cur.rank ?? 0;
        conditions.push(Prisma.sql`(
          ts_rank(${vector}, ${tsq}) < ${rank}
          OR (
            ts_rank(${vector}, ${tsq}) = ${rank}
            AND (u."createdAt", u."id") < (${createdAt}, ${cur.id})
          )
        )`);
      }
    }

    const whereSql = Prisma.join(conditions, " AND ");
    const orderSql =
      filters.sort === "oldest"
        ? Prisma.sql`u."createdAt" ASC, u."id" ASC`
        : filters.sort === "newest"
          ? Prisma.sql`u."createdAt" DESC, u."id" DESC`
          : Prisma.sql`rank DESC, u."createdAt" DESC, u."id" DESC`;

    const rows = await this.prisma.$queryRaw<
      Array<{
        id: string;
        name: string;
        email: string;
        avatarUrl: string | null;
        about: string | null;
        createdAt: Date;
        rank: number | null;
      }>
    >(Prisma.sql`
      SELECT
        u."id",
        u."name",
        u."email",
        u."avatarUrl",
        u."about",
        u."createdAt",
        ts_rank(${vector}, ${tsq})::float8 AS "rank"
      FROM "users" u
      WHERE ${whereSql}
      ORDER BY ${orderSql}
      LIMIT ${take}
    `);

    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      email: r.email,
      avatarUrl: r.avatarUrl,
      about: r.about,
      rank: r.rank,
      createdAtDate: r.createdAt,
      rankValue: r.rank,
    }));
  }

  async searchGroups(
    viewerId: string,
    filters: DirectorySearchFilters
  ): Promise<GroupSearchRow[]> {
    const { mode, expression } = resolveTsMode(filters.q);
    const tsq = tsQuerySql(mode, expression);
    const take = filters.limit + 1;
    const vector = Prisma.sql`to_tsvector('english', coalesce(c."name", ''))`;

    const conditions: Prisma.Sql[] = [
      Prisma.sql`c."type" = 'GROUP'`,
      Prisma.sql`c."deletedAt" IS NULL`,
      Prisma.sql`${vector} @@ ${tsq}`,
      Prisma.sql`EXISTS (
        SELECT 1 FROM "conversation_members" cm
        WHERE cm."conversationId" = c."id"
          AND cm."userId" = ${viewerId}
          AND cm."leftAt" IS NULL
          AND cm."deletedAt" IS NULL
      )`,
    ];

    if (filters.cursor) {
      const cur = decodeSearchCursor(filters.cursor);
      const createdAt = new Date(cur.createdAt);
      if (filters.sort === "oldest") {
        conditions.push(
          Prisma.sql`(c."createdAt", c."id") > (${createdAt}, ${cur.id})`
        );
      } else if (filters.sort === "newest") {
        conditions.push(
          Prisma.sql`(c."createdAt", c."id") < (${createdAt}, ${cur.id})`
        );
      } else {
        const rank = cur.rank ?? 0;
        conditions.push(Prisma.sql`(
          ts_rank(${vector}, ${tsq}) < ${rank}
          OR (
            ts_rank(${vector}, ${tsq}) = ${rank}
            AND (c."createdAt", c."id") < (${createdAt}, ${cur.id})
          )
        )`);
      }
    }

    const whereSql = Prisma.join(conditions, " AND ");
    const orderSql =
      filters.sort === "oldest"
        ? Prisma.sql`c."createdAt" ASC, c."id" ASC`
        : filters.sort === "newest"
          ? Prisma.sql`c."createdAt" DESC, c."id" DESC`
          : Prisma.sql`rank DESC, c."createdAt" DESC, c."id" DESC`;

    const rows = await this.prisma.$queryRaw<
      Array<{
        id: string;
        name: string | null;
        avatarUrl: string | null;
        description: string | null;
        memberCount: bigint | number;
        createdAt: Date;
        rank: number | null;
      }>
    >(Prisma.sql`
      SELECT
        c."id",
        c."name",
        c."avatarUrl",
        c."description",
        (
          SELECT COUNT(*)::int FROM "conversation_members" m
          WHERE m."conversationId" = c."id"
            AND m."leftAt" IS NULL
            AND m."deletedAt" IS NULL
        ) AS "memberCount",
        c."createdAt",
        ts_rank(${vector}, ${tsq})::float8 AS "rank"
      FROM "conversations" c
      WHERE ${whereSql}
      ORDER BY ${orderSql}
      LIMIT ${take}
    `);

    return rows.map((r) => ({
      id: r.id,
      name: r.name ?? "Group",
      avatarUrl: r.avatarUrl,
      description: r.description,
      memberCount: Number(r.memberCount),
      rank: r.rank,
      createdAtDate: r.createdAt,
      rankValue: r.rank,
    }));
  }

  async searchConversations(
    viewerId: string,
    filters: DirectorySearchFilters
  ): Promise<ConversationSearchRow[]> {
    const { mode, expression } = resolveTsMode(filters.q);
    const tsq = tsQuerySql(mode, expression);
    const take = filters.limit + 1;
    // Match group name, last preview, or direct peer name.
    const vector = Prisma.sql`to_tsvector(
      'english',
      coalesce(c."name", '') || ' ' ||
      coalesce(c."lastMessagePreview", '') || ' ' ||
      coalesce((
        SELECT u."name" FROM "conversation_members" om
        INNER JOIN "users" u ON u."id" = om."userId"
        WHERE om."conversationId" = c."id"
          AND om."userId" <> ${viewerId}
          AND om."leftAt" IS NULL
          AND om."deletedAt" IS NULL
          AND u."deletedAt" IS NULL
        LIMIT 1
      ), '')
    )`;

    const conditions: Prisma.Sql[] = [
      Prisma.sql`c."deletedAt" IS NULL`,
      Prisma.sql`${vector} @@ ${tsq}`,
      Prisma.sql`EXISTS (
        SELECT 1 FROM "conversation_members" cm
        WHERE cm."conversationId" = c."id"
          AND cm."userId" = ${viewerId}
          AND cm."leftAt" IS NULL
          AND cm."deletedAt" IS NULL
      )`,
    ];

    if (filters.cursor) {
      const cur = decodeSearchCursor(filters.cursor);
      const createdAt = new Date(cur.createdAt);
      // Conversations cursor uses lastMessageAt falling back to createdAt
      if (filters.sort === "oldest") {
        conditions.push(
          Prisma.sql`(coalesce(c."lastMessageAt", c."createdAt"), c."id") > (${createdAt}, ${cur.id})`
        );
      } else if (filters.sort === "newest") {
        conditions.push(
          Prisma.sql`(coalesce(c."lastMessageAt", c."createdAt"), c."id") < (${createdAt}, ${cur.id})`
        );
      } else {
        const rank = cur.rank ?? 0;
        conditions.push(Prisma.sql`(
          ts_rank(${vector}, ${tsq}) < ${rank}
          OR (
            ts_rank(${vector}, ${tsq}) = ${rank}
            AND (coalesce(c."lastMessageAt", c."createdAt"), c."id") < (${createdAt}, ${cur.id})
          )
        )`);
      }
    }

    const whereSql = Prisma.join(conditions, " AND ");
    const orderSql =
      filters.sort === "oldest"
        ? Prisma.sql`coalesce(c."lastMessageAt", c."createdAt") ASC, c."id" ASC`
        : filters.sort === "newest"
          ? Prisma.sql`coalesce(c."lastMessageAt", c."createdAt") DESC, c."id" DESC`
          : Prisma.sql`rank DESC, coalesce(c."lastMessageAt", c."createdAt") DESC, c."id" DESC`;

    const rows = await this.prisma.$queryRaw<
      Array<{
        id: string;
        type: string;
        name: string | null;
        avatarUrl: string | null;
        lastMessagePreview: string | null;
        lastMessageAt: Date | null;
        sortAt: Date;
        peerName: string | null;
        rank: number | null;
      }>
    >(Prisma.sql`
      SELECT
        c."id",
        c."type"::text AS "type",
        c."name",
        c."avatarUrl",
        c."lastMessagePreview",
        c."lastMessageAt",
        coalesce(c."lastMessageAt", c."createdAt") AS "sortAt",
        (
          SELECT u."name" FROM "conversation_members" om
          INNER JOIN "users" u ON u."id" = om."userId"
          WHERE om."conversationId" = c."id"
            AND om."userId" <> ${viewerId}
            AND om."leftAt" IS NULL
            AND om."deletedAt" IS NULL
            AND u."deletedAt" IS NULL
          LIMIT 1
        ) AS "peerName",
        ts_rank(${vector}, ${tsq})::float8 AS "rank"
      FROM "conversations" c
      WHERE ${whereSql}
      ORDER BY ${orderSql}
      LIMIT ${take}
    `);

    return rows.map((r) => ({
      id: r.id,
      type: r.type === "GROUP" ? "group" : "direct",
      name:
        r.type === "GROUP"
          ? (r.name ?? "Group")
          : (r.peerName ?? r.name ?? "Direct chat"),
      avatarUrl: r.avatarUrl,
      lastMessagePreview: r.lastMessagePreview,
      lastMessageAt: r.lastMessageAt?.toISOString() ?? null,
      rank: r.rank,
      createdAtDate: r.sortAt,
      rankValue: r.rank,
    }));
  }
}
