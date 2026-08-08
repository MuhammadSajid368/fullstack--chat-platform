import type { Icon } from "phosphor-react";
import type { MessageItem } from "../components/types";

// ----------------------------------------------------------------------

export interface ProfileMenuItem {
  title: string;
  icon: Icon;
}

export interface NavButtonItem {
  index: number;
  icon: Icon;
}

export interface MemberItem {
  id: number;
  img: string;
  name: string;
  online: boolean;
}

export interface CallLogItem {
  id: number;
  img: string;
  name: string;
  missed: boolean;
  incoming: boolean;
  online: boolean;
}

export interface ChatListItem {
  id: number;
  img: string;
  name: string;
  msg: string;
  time: string;
  unread: number;
  pinned: boolean;
  online: boolean;
}

export interface MessageOptionItem {
  title: string;
}

export type ChatHistoryItem = MessageItem;

export type SharedMessageItem = MessageItem;
