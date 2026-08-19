export type PersonNameParts = {
  familyName: string;
  givenName: string;
  name: string;
};

/** 最初の半角/全角スペースで分割。スペースがなければ全体を苗字にする。 */
export const splitPersonName = (value: string): { familyName: string; givenName: string } => {
  const trimmed = value.trim();
  if (!trimmed) {
    return { familyName: '', givenName: '' };
  }
  const match = trimmed.match(/^(.+?)[ \u3000]+(.*)$/u);
  if (!match) {
    return { familyName: trimmed, givenName: '' };
  }
  return {
    familyName: match[1].trim(),
    givenName: match[2].trim(),
  };
};

export const joinPersonName = (familyName: string, givenName: string): string =>
  [familyName.trim(), givenName.trim()].filter((part) => part.length > 0).join(' ');

export const isPersonNameValid = (familyName: string, givenName: string): boolean =>
  familyName.trim().length > 0 || givenName.trim().length > 0;

export const resolvePersonNameParts = (input: {
  familyName?: string | null;
  givenName?: string | null;
  name?: string | null;
}): PersonNameParts => {
  const familyName = (input.familyName ?? '').trim();
  const givenName = (input.givenName ?? '').trim();
  if (familyName || givenName) {
    return { familyName, givenName, name: joinPersonName(familyName, givenName) };
  }
  const split = splitPersonName(input.name ?? '');
  return {
    familyName: split.familyName,
    givenName: split.givenName,
    name: joinPersonName(split.familyName, split.givenName),
  };
};

/** 苗字・名前の両方が揃い、既存人物と一致する場合のみ返す。 */
export const findFriendsWithSameName = <
  T extends { familyName?: string | null; givenName?: string | null; name?: string | null },
>(
  friends: T[],
  familyName: string,
  givenName: string
): T[] => {
  const family = familyName.trim();
  const given = givenName.trim();
  if (!family || !given) {
    return [];
  }
  return friends.filter((friend) => {
    const parts = resolvePersonNameParts(friend);
    return parts.familyName === family && parts.givenName === given;
  });
};
