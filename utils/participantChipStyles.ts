import { StyleSheet } from 'react-native';
import { Radius, Theme } from '@/constants/theme';

export const participantChipStyles = StyleSheet.create({
  scroll: {
    flexGrow: 0,
  },
  scrollContent: {
    gap: 6,
    paddingVertical: 2,
  },
  wrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Theme.border,
    borderRadius: 999,
    backgroundColor: Theme.accentLight,
    paddingLeft: 4,
    paddingRight: 4,
    maxWidth: 180,
  },
  chipCompact: {
    maxWidth: 140,
  },
  chipGroup: {
    paddingLeft: 10,
    paddingRight: 10,
  },
  chipBody: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 4,
    paddingLeft: 4,
    paddingRight: 2,
    flexShrink: 1,
  },
  chipBodyGroup: {
    paddingLeft: 0,
    paddingRight: 0,
  },
  avatar: {
    width: 24,
    height: 24,
    borderRadius: Radius.sm,
    backgroundColor: Theme.homeCardPhotoPlaceholder,
  },
  avatarCompact: {
    width: 20,
    height: 20,
    borderRadius: 6,
  },
  avatarPlaceholder: {
    width: 24,
    height: 24,
    borderRadius: Radius.sm,
    backgroundColor: Theme.homeCardPhotoPlaceholder,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInitial: {
    fontSize: 11,
    fontWeight: '700',
    color: Theme.homeCardPhotoPlaceholderText,
  },
  avatarInitialCompact: {
    fontSize: 10,
  },
  name: {
    fontSize: 12,
    fontWeight: '600',
    color: Theme.textPrimary,
    flexShrink: 1,
  },
  nameCompact: {
    fontSize: 11,
  },
  removeButton: {
    width: 20,
    height: 20,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 2,
  },
  removeButtonText: {
    fontSize: 16,
    lineHeight: 18,
    fontWeight: '700',
    color: Theme.textSecondary,
  },
});
