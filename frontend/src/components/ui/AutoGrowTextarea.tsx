import { forwardRef, useCallback, useRef, useImperativeHandle } from "react";
import { cn } from "@/lib/utils";

export interface AutoGrowTextareaProps extends Omit<
  React.TextareaHTMLAttributes<HTMLTextAreaElement>,
  "onSubmit"
> {
  /** When true (default), Enter submits and Shift/Alt+Enter inserts newline. When false, standard textarea behavior. */
  submitOnEnter?: boolean;
  /** Called when Enter is pressed (only when submitOnEnter is true). */
  onSubmit?: () => void;
}

export const AutoGrowTextarea = forwardRef<
  HTMLTextAreaElement,
  AutoGrowTextareaProps
>(function AutoGrowTextarea(
  { submitOnEnter = true, onSubmit, className, onInput, onKeyDown, ...props },
  ref,
) {
  const internalRef = useRef<HTMLTextAreaElement>(null);
  useImperativeHandle(ref, () => internalRef.current!);

  const grow = useCallback((el: HTMLTextAreaElement) => {
    el.style.height = "auto";
    el.style.height = el.scrollHeight + "px";
  }, []);

  const handleInput = useCallback(
    (e: React.FormEvent<HTMLTextAreaElement>) => {
      grow(e.currentTarget);
      onInput?.(e);
    },
    [grow, onInput],
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (submitOnEnter && e.key === "Enter" && !e.shiftKey && !e.altKey) {
        e.preventDefault();
        onSubmit?.();
      }
      onKeyDown?.(e);
    },
    [submitOnEnter, onSubmit, onKeyDown],
  );

  return (
    <textarea
      ref={internalRef}
      rows={1}
      {...props}
      className={cn("resize-none", className)}
      onInput={handleInput}
      onKeyDown={handleKeyDown}
    />
  );
});
