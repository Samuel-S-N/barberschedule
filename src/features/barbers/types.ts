export type PublicBarber = {
  active: boolean;
  archivedAt: string | null;
  id: string;
  name: string;
  shopId: string;
};

export type OwnerBarber = PublicBarber & {
  userId: string | null;
};

export type BarberInput = {
  name: string;
  shopId: string;
  userId?: string | null;
};

export type PublicBarberRow = {
  active: boolean;
  archived_at: string | null;
  id: string;
  name: string;
  shop_id: string;
};

export type OwnerBarberRow = PublicBarberRow & {
  user_id: string | null;
};
