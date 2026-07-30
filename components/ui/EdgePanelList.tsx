import { Children, Fragment, isValidElement, type ReactNode } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
import { StyleSheet, View } from 'react-native';
import { useUiKit } from '@/contexts/UiPreviewContext';
import { Spacing } from '@/constants/theme';
import { SectionDivider } from '@/components/ui/Panel';
import { useContentColors } from '@/utils/useContentColors';

type EdgePanelListProps = {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
};

type EdgePanelDividerProps = {
  style?: StyleProp<ViewStyle>;
};

export function EdgePanelDivider({ style }: EdgePanelDividerProps) {
  return <SectionDivider style={style} />;
}

export function EdgePanelList({ children, style }: EdgePanelListProps) {
  const kit = useUiKit();
  const content = useContentColors();
  const items = Children.toArray(children).filter((child) => isValidElement(child));

  if (items.length === 0) {
    return null;
  }

  const borderColor = content.contentTextSecondary;
  const panelBackground =
    kit.listPanelStyle === 'edgeFlat' ? content.contentCard : kit.panelBackground;

  return (
    <View
      style={[
        styles.panel,
        {
          backgroundColor: panelBackground,
          borderColor,
        },
        style,
      ]}
    >
      {items.map((item, index) => (
        <Fragment key={isValidElement(item) && item.key != null ? item.key : `edge-panel-${index}`}>
          {index > 0 ? <EdgePanelDivider /> : null}
          {item}
        </Fragment>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  panel: {
    borderTopWidth: 2,
    borderBottomWidth: 2,
  },
});
