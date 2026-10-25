import { hrefPathname } from '@/utils/tabStacks';

function queryValue(href: string, key: string): string {
  const queryIndex = href.indexOf('?');
  if (queryIndex < 0) {
    return '';
  }
  return new URLSearchParams(href.slice(queryIndex + 1)).get(key)?.trim() ?? '';
}

function pathIs(href: string, segment: string): boolean {
  return hrefPathname(href).includes(segment);
}

export function taskHrefMatch(taskId: string): (href: string) => boolean {
  const id = taskId.trim();
  return (href) => {
    if (!id) {
      return false;
    }
    if (!pathIs(href, 'task-detail') && !pathIs(href, 'task-edit')) {
      return false;
    }
    return queryValue(href, 'taskId') === id;
  };
}

export function episodeDetailHrefMatch(episodeId: string): (href: string) => boolean {
  const id = episodeId.trim();
  return (href) => {
    if (!id || !pathIs(href, 'episode-detail')) {
      return false;
    }
    return queryValue(href, 'episodeId') === id;
  };
}

export function eventHrefMatch(eventId: string): (href: string) => boolean {
  const id = eventId.trim();
  return (href) => {
    if (!id) {
      return false;
    }
    const path = hrefPathname(href);
    const isEventDetail = path.includes('event-detail');
    const isEventEdit = path.includes('/event') && !isEventDetail;
    if (!isEventDetail && !isEventEdit) {
      return false;
    }
    return queryValue(href, 'eventId') === id;
  };
}

export function taskGroupHrefMatch(groupId: string): (href: string) => boolean {
  const id = groupId.trim();
  return (href) => {
    if (!id || !pathIs(href, 'task-group')) {
      return false;
    }
    return queryValue(href, 'groupId') === id;
  };
}

export function personHrefMatch(friendId: string): (href: string) => boolean {
  const id = friendId.trim();
  return (href) => {
    if (!id || hrefPathname(href) !== '/detail') {
      return false;
    }
    return queryValue(href, 'id') === id;
  };
}
