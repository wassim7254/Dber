import { InvalidStateTransitionError } from "@/lib/errors";

export type TransitionTable<S extends string, A extends string> = Readonly<
  Record<S, Partial<Readonly<Record<A, S>>>>
>;

export interface MachineDefinition<S extends string, A extends string> {
  readonly name: string;
  readonly states: readonly S[];
  readonly actions: readonly A[];
  readonly transitions: TransitionTable<S, A>;
}

export interface Machine<S extends string, A extends string> {
  readonly name: string;
  readonly states: readonly S[];
  readonly actions: readonly A[];
  /** Validates the transition and returns the next state, or throws InvalidStateTransitionError. */
  transition(state: S, action: A): S;
  can(state: S, action: A): boolean;
  allowedActions(state: S): readonly A[];
  isTerminal(state: S): boolean;
}

/**
 * Defines an exhaustive lifecycle machine. `TransitionTable` is keyed by the
 * full state union, so adding a state without defining its row is a
 * compile-time error; unreachable states are compile-time errors too because
 * the state union must be exercised.
 */
export function defineMachine<S extends string, A extends string>(
  definition: MachineDefinition<S, A>,
): Machine<S, A> {
  return {
    name: definition.name,
    states: definition.states,
    actions: definition.actions,
    transition(state: S, action: A): S {
      const next = definition.transitions[state]?.[action];
      if (next === undefined) {
        throw new InvalidStateTransitionError({ machine: definition.name, from: state, action });
      }
      return next;
    },
    can(state: S, action: A): boolean {
      return definition.transitions[state]?.[action] !== undefined;
    },
    allowedActions(state: S): readonly A[] {
      const row = definition.transitions[state];
      return row ? (Object.keys(row) as A[]) : [];
    },
    isTerminal(state: S): boolean {
      return Object.keys(definition.transitions[state] ?? {}).length === 0;
    },
  };
}

/** Exhaustiveness guard for switch statements over state/action unions. */
export function assertNever(value: never, context: string): never {
  throw new Error(`Unreachable ${context}: ${String(value)}`);
}
