import { Children, Fragment, isValidElement, type ReactNode } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
import { StyleSheet, View } from 'react-native';
import { useUiKit } from '@/contexts/UiPreviewContext';
import { Panel, SectionDivider } from '@/components/ui/Panel';

type FormScreenBodyProps = {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  gap?: number;
};

export function FormScreenBody({ children, style, gap = 6 }: FormScreenBodyProps) {
  const kit = useUiKit();
  const sections = Children.toArray(children).filter((child) => isValidElement(child) || child !== null);

  if (kit.formContainer === 'singlePanel') {
    return (
      <Panel style={style}>
        {sections.map((section, index) => (
          <Fragment key={isValidElement(section) && section.key != null ? section.key : `section-${index}`}>
            {index > 0 ? <SectionDivider /> : null}
            {section}
          </Fragment>
        ))}
      </Panel>
    );
  }

  return <View style={[styles.multiBody, { gap }, style]}>{children}</View>;
}

const styles = StyleSheet.create({
  multiBody: {
    width: '100%',
  },
});
