import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Image,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { FormRow } from '@/components/ui/FormRow';
import { FormScreenSection, FormScreenTemplate } from '@/components/screen-templates';
import {
  contentFilledButtonStyle,
  contentFilledButtonTextStyle,
  contentInputStyle,
  contentMutedTextStyle,
  contentSelectedOptionStyle,
  contentSurfaceStyle,
  contentTextStyle,
} from '@/utils/contentStyleHelpers';
import { useContentColors } from '@/utils/useContentColors';
import { isPersonNameValid, resolvePersonNameParts } from '@/utils/personName';
import {
  confirmMyself,
  createFriend,
  getAllFriends,
  getFriendById,
  getMyselfSetupPhase,
  getResolvedMyselfId,
  initializeDatabase,
  type MyselfSetupPhase,
} from '../db';
import type { Friend, FriendInput } from '../types';
import { Theme, Radius, Spacing } from '@/constants/theme';

const EMPTY_FRIEND: FriendInput = {
  name: '',
  familyName: '',
  givenName: '',
  nickname: '',
  origin: '',
  residence: '',
  mbti: '',
  birthday: '',
  height: null,
  weight: null,
  category: '',
  description: '',
  photoUri: null,
  affiliations: [],
  personalities: [],
  experiences: [],
  traits: [],
  notes: [],
  likes: [],
  dislikes: [],
};

export default function SetupMyselfScreen() {
  const router = useRouter();
  const content = useContentColors();
  const [phase, setPhase] = useState<MyselfSetupPhase>('register');
  const [showRegister, setShowRegister] = useState(false);
  const [friends, setFriends] = useState<Friend[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [familyName, setFamilyName] = useState('');
  const [givenName, setGivenName] = useState('');
  const confirmPrompted = useRef(false);

  const reload = useCallback(() => {
    initializeDatabase();
    const nextPhase = getMyselfSetupPhase();
    setPhase(nextPhase);
    const list = getAllFriends();
    setFriends(list);
    const current = getResolvedMyselfId();
    setSelectedId(current ?? list[0]?.id ?? null);
    if (nextPhase === 'register') {
      setShowRegister(true);
    } else if (nextPhase === 'pick') {
      setShowRegister(false);
    }
    return nextPhase;
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  const currentMyself = useMemo(() => {
    const id = getResolvedMyselfId();
    return id ? getFriendById(id) : null;
  }, [phase, friends]);

  useEffect(() => {
    if (phase !== 'confirm' || confirmPrompted.current) {
      return;
    }
    confirmPrompted.current = true;
    const name = currentMyself?.name?.trim() || 'この人物';
    Alert.alert(
      '本人の確認',
      `「${name}」さんが本人でよろしいですか？確認後は変更できません。`,
      [
        {
          text: 'いいえ',
          style: 'cancel',
          onPress: () => {
            setShowRegister(false);
            setPhase('pick');
          },
        },
        {
          text: 'はい',
          onPress: () => {
            const id = getResolvedMyselfId();
            if (!id || !confirmMyself(id)) {
              Alert.alert('エラー', '本人の確定に失敗しました。');
              confirmPrompted.current = false;
              return;
            }
            router.replace('/calendar');
          },
        },
      ],
      { cancelable: false }
    );
  }, [phase, currentMyself, router]);

  const finishWithFriendId = (friendId: string) => {
    initializeDatabase();
    if (!confirmMyself(friendId)) {
      Alert.alert('エラー', '本人の登録に失敗しました。');
      return;
    }
    router.replace('/calendar');
  };

  const handleCreate = () => {
    if (!isPersonNameValid(familyName, givenName)) {
      Alert.alert('入力エラー', '苗字か名前のどちらかを入力してください。');
      return;
    }
    const nameParts = resolvePersonNameParts({ familyName, givenName });
    initializeDatabase();
    const created = createFriend({
      ...EMPTY_FRIEND,
      name: nameParts.name,
      familyName: nameParts.familyName,
      givenName: nameParts.givenName,
    });
    finishWithFriendId(created.id);
  };

  const handlePick = () => {
    if (!selectedId) {
      Alert.alert('未選択', '本人にする人物を選んでください。');
      return;
    }
    finishWithFriendId(selectedId);
  };

  const title = showRegister ? '本人の登録' : '本人を選ぶ';
  const hint = showRegister
    ? '最初に、あなた自身の人物カードを作ります。あとからプロフィールは編集できます。'
    : 'すでに作った人物カードから、本人を選んでください。確認後は変更できません。';

  return (
    <FormScreenTemplate
      title={title}
      footer={
        <View style={styles.footer}>
          <Pressable
            style={[styles.primaryButton, contentFilledButtonStyle(content)]}
            onPress={showRegister ? handleCreate : handlePick}
          >
            <Text style={[styles.primaryButtonText, contentFilledButtonTextStyle(content)]}>
              {showRegister ? '登録してはじめる' : 'この人を本人にする'}
            </Text>
          </Pressable>
        </View>
      }
    >
      <Text style={[styles.hint, contentMutedTextStyle(content)]}>{hint}</Text>

      {showRegister ? (
        <FormScreenSection>
          <FormRow label="苗字">
            <TextInput
              value={familyName}
              onChangeText={setFamilyName}
              placeholder="山田"
              placeholderTextColor={content.contentTextSecondary}
              style={[styles.input, contentInputStyle(content)]}
              autoFocus
            />
          </FormRow>
          <FormRow label="名前">
            <TextInput
              value={givenName}
              onChangeText={setGivenName}
              placeholder="太郎"
              placeholderTextColor={content.contentTextSecondary}
              style={[styles.input, contentInputStyle(content)]}
            />
          </FormRow>
        </FormScreenSection>
      ) : (
        <View style={styles.list}>
          {friends.map((friend) => {
            const selected = friend.id === selectedId;
            return (
              <Pressable
                key={friend.id}
                onPress={() => setSelectedId(friend.id)}
                style={[
                  styles.friendRow,
                  contentSurfaceStyle(content),
                  selected ? contentSelectedOptionStyle(content) : { borderColor: content.contentBorder },
                ]}
              >
                {friend.photoUri ? (
                  <Image source={{ uri: friend.photoUri }} style={styles.photo} />
                ) : (
                  <View style={[styles.photo, styles.photoPlaceholder, { backgroundColor: content.contentPhotoPlaceholder }]} />
                )}
                <View style={styles.friendText}>
                  <Text style={[styles.friendName, contentTextStyle(content)]}>
                    {friend.name || '-'}
                  </Text>
                  {friend.nickname.trim() ? (
                    <Text style={[styles.friendMeta, contentMutedTextStyle(content)]}>
                      {friend.nickname}
                    </Text>
                  ) : null}
                </View>
                {selected ? (
                  <Text style={[styles.check, { color: content.contentText }]}>✓</Text>
                ) : null}
              </Pressable>
            );
          })}
        </View>
      )}

      {friends.length > 0 ? (
        <Pressable
          onPress={() => setShowRegister((prev) => !prev)}
          style={styles.switchMode}
        >
          <Text style={[styles.switchModeText, contentTextStyle(content)]}>
            {showRegister ? '既存の人物カードから選ぶ' : '新しく本人カードを作る'}
          </Text>
        </Pressable>
      ) : null}
    </FormScreenTemplate>
  );
}

const styles = StyleSheet.create({
  hint: {
    fontSize: 14,
    lineHeight: 21,
    marginBottom: Spacing.md,
  },
  input: {
    minHeight: 40,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderRadius: Radius.sm,
  },
  list: {
    gap: 10,
  },
  friendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderRadius: Radius.md,
  },
  photo: {
    width: 44,
    height: 44,
    borderRadius: 22,
  },
  photoPlaceholder: {
    borderWidth: 1,
    borderColor: Theme.border,
  },
  friendText: {
    flex: 1,
    minWidth: 0,
  },
  friendName: {
    fontSize: 16,
    fontWeight: '700',
  },
  friendMeta: {
    fontSize: 13,
    marginTop: 2,
  },
  check: {
    fontSize: 18,
    fontWeight: '700',
  },
  switchMode: {
    alignSelf: 'center',
    paddingVertical: 16,
  },
  switchModeText: {
    fontSize: 14,
    fontWeight: '600',
  },
  footer: {
    paddingHorizontal: Spacing.md,
    paddingBottom: Spacing.sm,
  },
  primaryButton: {
    borderRadius: Radius.md,
    paddingVertical: 14,
    alignItems: 'center',
  },
  primaryButtonText: {
    fontSize: 16,
    fontWeight: '700',
  },
});
