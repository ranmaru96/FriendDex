import { StyleSheet } from 'react-native';

export const ANSWER_PERSON_COL_WIDTH = 72;
export const ANSWER_AVATAR_SIZE = 36;

export const answerRowStyles = StyleSheet.create({
  list: {
    gap: 8,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  person: {
    width: ANSWER_PERSON_COL_WIDTH,
    alignItems: 'center',
    gap: 4,
  },
  avatar: {
    width: ANSWER_AVATAR_SIZE,
    height: ANSWER_AVATAR_SIZE,
    overflow: 'hidden',
  },
  avatarImage: {
    width: '100%',
    height: '100%',
  },
  avatarFallback: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInitial: {
    fontSize: 14,
    fontWeight: '800',
  },
  name: {
    width: '100%',
    fontSize: 11,
    fontWeight: '700',
    textAlign: 'center',
  },
  well: {
    flex: 1,
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderWidth: 1,
  },
  body: {
    fontSize: 15,
    fontWeight: '600',
  },
});
