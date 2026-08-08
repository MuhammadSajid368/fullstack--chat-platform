import type {
  SearchConversationHitDto,
  SearchGroupHitDto,
  SearchMessageHitDto,
  SearchUserHitDto,
} from "@modules/search/dto/SearchDto.js";
import type {
  ConversationSearchRow,
  GroupSearchRow,
  MessageSearchRow,
  UserSearchRow,
} from "@modules/search/interfaces/ISearchRepository.js";

export class SearchMapper {
  static toMessageHit(row: MessageSearchRow): SearchMessageHitDto {
    return {
      id: row.id,
      conversationId: row.conversationId,
      senderId: row.senderId,
      type: row.type,
      content: row.content,
      snippet: row.snippet,
      createdAt: row.createdAt,
      rank: row.rank,
    };
  }

  static toUserHit(row: UserSearchRow): SearchUserHitDto {
    return {
      id: row.id,
      name: row.name,
      email: row.email,
      avatarUrl: row.avatarUrl,
      about: row.about,
      rank: row.rank,
    };
  }

  static toGroupHit(row: GroupSearchRow): SearchGroupHitDto {
    return {
      id: row.id,
      name: row.name,
      avatarUrl: row.avatarUrl,
      description: row.description,
      memberCount: row.memberCount,
      rank: row.rank,
    };
  }

  static toConversationHit(
    row: ConversationSearchRow
  ): SearchConversationHitDto {
    return {
      id: row.id,
      type: row.type,
      name: row.name,
      avatarUrl: row.avatarUrl,
      lastMessagePreview: row.lastMessagePreview,
      lastMessageAt: row.lastMessageAt,
      rank: row.rank,
    };
  }

  static messageTypeToPrisma(type: string): string {
    return type.toUpperCase();
  }
}
