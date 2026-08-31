import { Children, Fragment, isValidElement, type ReactNode } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
import { StyleSheet, View } from 'react-native';
import { usesOffsetChrome } from '@/constants/designPatterns';
import { useAppThemeOptional } from '@/contexts/AppThemeContext';
import { useUiKit } from '@/contexts/UiPreviewContext';
import { Panel, SectionDivider } from '@/components/ui/Panel';

type FormScreenBodyProps = {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  gap?: number;
};

export function FormScreenBody({ children, style, gap = 6 }: FormScreenBodyProps) {
  const kit = useUiKit();
  const patternId = useAppThemeOptional()?.patternId;
  const sections = Children.toArray(children).filter((child) => isValidElement(child) || child !== null);
  const stacked = sections.map((section, index) => (
    <Fragment key={isValidElement(section) && section.key != null ? section.key : `section-${index}`}>
      {index > 0 ? <SectionDivider /> : null}
      {section}
    </Fragment>
  ));

  if (kit.formContainer === 'singlePanel') {
    // 図鑑／コーデックスの OffsetCard は一覧用。編集画面全体は外枠なし。
    if (usesOffsetChrome(patternId)) {
      return <View style={style}>{stacked}</View>;
    }
    return <Panel style={style}>{stacked}</Panel>;
  }

  return <View style={[styles.multiBody, { gap }, style]}>{children}</View>;
}

const styles = StyleSheet.create({
  multiBody: {
    width: '100%',
  },
});
