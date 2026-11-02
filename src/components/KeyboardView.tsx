import { useId } from 'react';
import { IMAGE_HEIGHT, IMAGE_WIDTH } from '../hid/layout';
import { KeyboardGraphic, type KeyboardKeyProps } from './KeyboardGraphic';
import { useAppearance } from '../theme/AppearanceContext';

/** The same SVG keys own their artwork, lighting, labels and interactions. */
export function KeyboardView(props: KeyboardKeyProps) {
  const { palette } = useAppearance();
  const id = useId().replace(/:/g, '');
  return (
    <svg viewBox={`0 0 ${IMAGE_WIDTH} ${IMAGE_HEIGHT}`}
      className={props.onKeyClick ? 'kb-svg' : 'kb-svg kb-static'}>
      <KeyboardGraphic palette={palette} idPrefix={`kb-view-${id}`} {...props} />
    </svg>
  );
}
