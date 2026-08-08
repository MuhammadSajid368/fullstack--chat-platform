import { useEffect, useRef } from "react";
import { useDispatch, useSelector } from "../redux/store";
import { advanceMessageStatus, statusProgression } from "../redux/slices/chatSlice";
import { selectCurrentUserId } from "../redux/selectors/authSelectors";
import { isMockMode } from "../config/env";
import type { Message } from "../types/chat";

/**
 * Mock-only delivery/read progression.
 * REST mode keeps status based solely on the server response.
 */
export function useMessageStatusProgression(
  messages: Message[],
  conversationId: string | null
): void {
  const dispatch = useDispatch();
  const currentUserId = useSelector(selectCurrentUserId);
  const timersRef = useRef<number[]>([]);

  useEffect(() => {
    timersRef.current.forEach((timerId) => window.clearTimeout(timerId));
    timersRef.current = [];

    if (!conversationId || !isMockMode()) {
      return undefined;
    }

    for (const message of messages) {
      if (message.senderId !== currentUserId) {
        continue;
      }

      const currentIndex = statusProgression.indexOf(message.status);
      if (currentIndex === -1 || currentIndex >= statusProgression.length - 1) {
        continue;
      }

      const nextStatus = statusProgression[currentIndex + 1];
      const timerId = window.setTimeout(() => {
        dispatch(
          advanceMessageStatus({
            conversationId,
            messageId: message.id,
            status: nextStatus,
          })
        );
      }, 1200);

      timersRef.current.push(timerId);
    }

    return () => {
      timersRef.current.forEach((timerId) => window.clearTimeout(timerId));
      timersRef.current = [];
    };
  }, [conversationId, currentUserId, dispatch, messages]);
}
