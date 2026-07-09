import { Children, Fragment, isValidElement, type ReactNode } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
import { StyleSheet, View } from 'react-native';
import { useUiKit } from '@/contexts/UiPreviewContext';
import { Panel, PanelSection, SectionDivider } from '@/components/ui/Panel';

type ListItemGroupProps = {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  gap?: number;
};

export function ListItemGroup({ children, style, gap = 8 }: ListItemGroupProps) {
  const kit = useUiKit();
  const items = Children.toArray(children).filter((child) => isValidElement(child));

  if (kit.listItemStyle === 'panelSections' && items.length > 0) {
    return (
      <Panel style={style}>
        {items.map((item, index) => (
          <Fragment key={isValidElement(item) && item.key != null ? item.key : `list-item-${index}`}>
            {index > 0 ? <SectionDivider /> : null}
            <PanelSection style={styles.panelItem}>{item}</PanelSection>
          </Fragment>
        ))}
      </Panel>
    );
  }

  return <View style={[styles.separate, { gap }, style]}>{children}</View>;
}

const styles = StyleSheet.create({
  separate: {
    width: '100%',
  },
  panelItem: {
    paddingVertical: 0,
  },
});
