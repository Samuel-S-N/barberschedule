export type Customer = {
  active: boolean;
  archivedAt: string | null;
  email: string | null;
  fullName: string;
  id: string;
  phone: string | null;
  shopId: string;
  userId: string | null;
};

export type CustomerInput = {
  email?: string | null;
  fullName: string;
  phone?: string | null;
  shopId: string;
  userId?: string | null;
};

export type CustomerRow = {
  active: boolean;
  archived_at: string | null;
  email: string | null;
  full_name: string;
  id: string;
  phone: string | null;
  shop_id: string;
  user_id: string | null;
};
