import { Image, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { Radius, Spacing } from '@/constants/theme';
import {
  contentMutedTextStyle,
  contentSurfaceStyle,
  contentTextStyle,
} from '@/utils/contentStyleHelpers';
import { useContentColors } from '@/utils/useContentColors';
import type { Friend } from '@/types';

type PersonGlanceModalProps = {
  visible: boolean;
  friend: Friend | null;
  onClose: () => void;
};

export function PersonGlanceModal({ visible, friend, onClose }: PersonGlanceModalProps) {
  const content = useContentColors();
  if (!friend) {
    return null;
  }

  const initial = (friend.name.trim().charAt(0) || '?').toUpperCase();
  const photoUri = friend.photoUri?.trim() || null;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={[styles.card, contentSurfaceStyle(content)]}>
          <View style={[styles.photoFrame, { borderColor: content.contentBorder }]}>
            {photoUri ? (
              <Image source={{ uri: photoUri }} style={styles.photo} resizeMode="cover" />
            ) : (
              <View style={[styles.photoPlaceholder, { backgroundColor: content.contentInputBg }]}>
                <Text style={[styles.initial, contentTextStyle(content)]}>{initial}</Text>
              </View>
            )}
          </View>
          <Text style={[styles.name, contentTextStyle(content)]}>{friend.name}</Text>
          {friend.affiliations.length > 0 ? (
            <Text style={[styles.meta, contentMutedTextStyle(content)]}>
              {friend.affiliations.join(' · ')}
            </Text>
          ) : null}
          <Pressable style={styles.closeButton} onPress={onClose} accessibilityRole="button">
            <Text style={[styles.closeButtonText, contentTextStyle(content)]}>閉じる</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const PHOTO_SIZE = 120;

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.lg,
  },
  card: {
    width: '100%',
    maxWidth: 320,
    borderRadius: Radius.lg,
    borderWidth: 1,
    padding: Spacing.lg,
    alignItems: 'center',
    gap: Spacing.sm,
  },
  photoFrame: {
    width: PHOTO_SIZE,
    height: PHOTO_SIZE,
    borderRadius: PHOTO_SIZE / 2,
    borderWidth: 2,
    overflow: 'hidden',
  },
  photo: {
    width: '100%',
    height: '100%',
  },
  photoPlaceholder: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  initial: {
    fontSize: 40,
    fontWeight: '700',
  },
  name: {
    fontSize: 20,
    fontWeight: '700',
    textAlign: 'center',
  },
  meta: {
    fontSize: 14,
    textAlign: 'center',
  },
  closeButton: {
    marginTop: Spacing.sm,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.lg,
  },
  closeButtonText: {
    fontSize: 16,
    fontWeight: '600',
  },
});
