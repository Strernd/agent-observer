const GROUP_WORK_ITEM_PREFIX = "group:";

export type WorkItemRef =
  | {
      kind: "ticket";
      routeId: string;
      storageId: string;
      displayId: string;
      sessionGroup: null;
    }
  | {
      kind: "group";
      routeId: string;
      storageId: string;
      displayId: string;
      sessionGroup: string;
    };

export function buildGroupWorkItemId(sessionGroup: string) {
  return `${GROUP_WORK_ITEM_PREFIX}${sessionGroup}`;
}

export function parseWorkItemId(rawId: string): WorkItemRef {
  if (rawId.startsWith(GROUP_WORK_ITEM_PREFIX)) {
    const sessionGroup = rawId.slice(GROUP_WORK_ITEM_PREFIX.length);
    return {
      kind: "group",
      routeId: rawId,
      storageId: rawId,
      displayId: sessionGroup,
      sessionGroup,
    };
  }

  const ticketId = rawId.toUpperCase();
  return {
    kind: "ticket",
    routeId: ticketId,
    storageId: ticketId,
    displayId: ticketId,
    sessionGroup: null,
  };
}

export function buildWorkItemPath(routeId: string) {
  return `/tickets/${encodeURIComponent(routeId)}`;
}

export function resolveSessionWorkItem(
  ticketId: string | null | undefined,
  sessionGroup: string | null | undefined
) {
  if (ticketId) {
    return parseWorkItemId(ticketId);
  }

  if (sessionGroup) {
    return parseWorkItemId(buildGroupWorkItemId(sessionGroup));
  }

  return null;
}

export function deriveSessionGroupCustomer(sessionGroup: string) {
  const parts = splitSessionGroup(sessionGroup);
  return parts[0] ?? sessionGroup;
}

export function deriveSessionGroupTitle(sessionGroup: string) {
  const parts = splitSessionGroup(sessionGroup);
  if (parts.length <= 1) {
    return null;
  }

  return parts.slice(1).join("/");
}

function splitSessionGroup(sessionGroup: string) {
  return sessionGroup.split(/[\\/]/).map((part) => part.trim()).filter(Boolean);
}
