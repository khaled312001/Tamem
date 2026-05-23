import {
  canRoleTransition,
  canTransition,
  ORDER_TRANSITIONS,
  OrderStatus,
  UserRole,
} from '@tamem/types';
import { describe, expect, it } from 'vitest';

import { assertTransition } from '../src/modules/orders/transitions.js';
import { AppError } from '../src/utils/errors.js';

describe('Order state machine', () => {
  describe('canTransition (FSM only)', () => {
    it('allows NEW → UNDER_REVIEW', () => {
      expect(canTransition(OrderStatus.NEW, OrderStatus.UNDER_REVIEW)).toBe(true);
    });

    it('forbids NEW → COMPLETED (must go through full lifecycle)', () => {
      expect(canTransition(OrderStatus.NEW, OrderStatus.COMPLETED)).toBe(false);
    });

    it('forbids NEW → DELIVERED', () => {
      expect(canTransition(OrderStatus.NEW, OrderStatus.DELIVERED)).toBe(false);
    });

    it('terminal states have no transitions', () => {
      expect(ORDER_TRANSITIONS[OrderStatus.COMPLETED]).toEqual([]);
      expect(ORDER_TRANSITIONS[OrderStatus.CANCELLED]).toEqual([]);
      expect(ORDER_TRANSITIONS[OrderStatus.REJECTED]).toEqual([]);
    });

    it('cancellation possible from most non-terminal states', () => {
      expect(canTransition(OrderStatus.NEW, OrderStatus.CANCELLED)).toBe(true);
      expect(canTransition(OrderStatus.PRICED, OrderStatus.CANCELLED)).toBe(true);
      expect(canTransition(OrderStatus.IN_ROUTE, OrderStatus.CANCELLED)).toBe(true);
    });

    it('DELIVERED only goes to COMPLETED', () => {
      expect(ORDER_TRANSITIONS[OrderStatus.DELIVERED]).toEqual([OrderStatus.COMPLETED]);
    });
  });

  describe('canRoleTransition (FSM + RBAC)', () => {
    it('ADMIN can perform any valid transition', () => {
      expect(canRoleTransition(OrderStatus.NEW, OrderStatus.UNDER_REVIEW, UserRole.ADMIN)).toBe(
        true,
      );
      expect(
        canRoleTransition(
          OrderStatus.AWAITING_CUSTOMER_APPROVAL,
          OrderStatus.ACCEPTED,
          UserRole.ADMIN,
        ),
      ).toBe(true);
    });

    it('CUSTOMER cannot move NEW → UNDER_REVIEW (admin-only)', () => {
      expect(canRoleTransition(OrderStatus.NEW, OrderStatus.UNDER_REVIEW, UserRole.CUSTOMER)).toBe(
        false,
      );
    });

    it('CUSTOMER can cancel own order', () => {
      expect(canRoleTransition(OrderStatus.NEW, OrderStatus.CANCELLED, UserRole.CUSTOMER)).toBe(
        true,
      );
    });

    it('CUSTOMER must approve quoted price', () => {
      expect(
        canRoleTransition(
          OrderStatus.AWAITING_CUSTOMER_APPROVAL,
          OrderStatus.ACCEPTED,
          UserRole.CUSTOMER,
        ),
      ).toBe(true);
    });

    it('DRIVER cannot transition NEW → UNDER_REVIEW', () => {
      expect(canRoleTransition(OrderStatus.NEW, OrderStatus.UNDER_REVIEW, UserRole.DRIVER)).toBe(
        false,
      );
    });

    it('DRIVER can pick up an assigned order', () => {
      expect(
        canRoleTransition(OrderStatus.DRIVER_ASSIGNED, OrderStatus.PICKED_UP, UserRole.DRIVER),
      ).toBe(true);
    });

    it('DRIVER can mark in-route and delivered', () => {
      expect(canRoleTransition(OrderStatus.PICKED_UP, OrderStatus.IN_ROUTE, UserRole.DRIVER)).toBe(
        true,
      );
      expect(canRoleTransition(OrderStatus.IN_ROUTE, OrderStatus.DELIVERED, UserRole.DRIVER)).toBe(
        true,
      );
    });
  });

  describe('assertTransition (throws on invalid)', () => {
    it('does not throw for valid admin transition', () => {
      expect(() =>
        assertTransition(OrderStatus.NEW, OrderStatus.UNDER_REVIEW, UserRole.ADMIN),
      ).not.toThrow();
    });

    it('throws InvalidTransitionError for unreachable status', () => {
      try {
        assertTransition(OrderStatus.NEW, OrderStatus.COMPLETED, UserRole.ADMIN);
        throw new Error('should have thrown');
      } catch (err) {
        expect(err).toBeInstanceOf(AppError);
        expect((err as AppError).code).toBe('INVALID_STATE_TRANSITION');
        expect((err as AppError).status).toBe(422);
      }
    });

    it('throws ForbiddenError when role is not allowed', () => {
      try {
        assertTransition(OrderStatus.NEW, OrderStatus.UNDER_REVIEW, UserRole.CUSTOMER);
        throw new Error('should have thrown');
      } catch (err) {
        expect(err).toBeInstanceOf(AppError);
        expect((err as AppError).code).toBe('FORBIDDEN');
        expect((err as AppError).status).toBe(403);
      }
    });
  });
});
