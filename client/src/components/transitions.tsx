import { cloneElement, forwardRef, useRef, type CSSProperties, type ReactElement, type Ref } from 'react';
import { Transition, type TransitionStatus } from 'react-transition-group';
import type { TransitionProps } from '@mui/material/transitions';
import { useForkRef } from '@mui/material/utils';
import { css } from '../theme/tokens';

type ChildProps = { style?: CSSProperties; ref?: Ref<HTMLElement> };
type Props = TransitionProps & { children: ReactElement<ChildProps> };

const reduced = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

function makeTransition(name: string, hidden: CSSProperties, enterMs: number, exitMs: number) {
  const visible: CSSProperties = { opacity: 1, transform: 'none' };
  const enterTransition = `opacity ${Math.round(enterMs * 0.6)}ms ${css.decelerate}, transform ${enterMs}ms ${css.decelerate}`;
  const exitTransition = `opacity ${exitMs}ms ${css.accelerate}, transform ${exitMs}ms ${css.accelerate}`;

  const Component = forwardRef<HTMLElement, Props>(function MotionTransition(props, ref) {
    const {
      in: inProp,
      appear = true,
      children,
      onEnter,
      onEntering,
      onEntered,
      onExit,
      onExiting,
      onExited,
      addEndListener: _addEndListener,
      timeout: _timeout,
      easing: _easing,
      style,
      ...other
    } = props as Props & { easing?: unknown };
    const nodeRef = useRef<HTMLElement | null>(null);
    const handleRef = useForkRef(nodeRef, children.props.ref ?? null, ref);
    const node = () => nodeRef.current as HTMLElement;
    const instant = reduced();

    const styleFor = (state: TransitionStatus): CSSProperties => {
      if (state === 'entering' || state === 'entered') {
        return { ...visible, transition: instant ? 'none' : enterTransition };
      }
      const base: CSSProperties = { ...hidden, transition: instant ? 'none' : exitTransition };
      if (state === 'exited' && !inProp) base.visibility = 'hidden';
      return base;
    };

    return (
      <Transition
        nodeRef={nodeRef}
        in={inProp}
        appear={appear}
        timeout={instant ? 0 : { enter: enterMs, exit: exitMs }}
        onEnter={(isAppearing: boolean) => {
          void node()?.offsetHeight;
          onEnter?.(node(), isAppearing);
        }}
        onEntering={(isAppearing: boolean) => onEntering?.(node(), isAppearing)}
        onEntered={(isAppearing: boolean) => onEntered?.(node(), isAppearing)}
        onExit={() => onExit?.(node())}
        onExiting={() => onExiting?.(node())}
        onExited={() => onExited?.(node())}
        {...other}
      >
        {(state: TransitionStatus, childProps?: Record<string, unknown>) =>
          cloneElement(children, {
            ...(childProps || {}),
            ref: handleRef,
            style: { ...styleFor(state), ...style, ...children.props.style },
          })
        }
      </Transition>
    );
  });
  Component.displayName = name;
  return Component;
}

export const GrowTransition = makeTransition('GrowTransition', { opacity: 0, transform: 'scale(0.94) translateY(8px)' }, 380, 180);

export const SlideUpTransition = makeTransition('SlideUpTransition', { opacity: 0, transform: 'translateY(48px)' }, 420, 200);
