"""add_supplier_id_and_price_net_to_inventory_movements

Revision ID: 19477a864a97
Revises: e84098e5ded7
Create Date: 2026-07-13 17:57:54.041620

"""

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "19477a864a97"
down_revision = "e84098e5ded7"
branch_labels = None
depends_on = None


def upgrade() -> None:
    conn = op.get_bind()
    columns = [
        col["name"] for col in sa.inspect(conn).get_columns("inventory_movements")
    ]

    if "supplier_id" not in columns:
        op.add_column(
            "inventory_movements", sa.Column("supplier_id", sa.String(), nullable=True)
        )
        op.create_foreign_key(
            "fk_inventory_movements_supplier_id",
            "inventory_movements",
            "suppliers",
            ["supplier_id"],
            ["id"],
        )

    if "price_net" not in columns:
        op.add_column(
            "inventory_movements", sa.Column("price_net", sa.Integer(), nullable=True)
        )


def downgrade() -> None:
    conn = op.get_bind()
    columns = [
        col["name"] for col in sa.inspect(conn).get_columns("inventory_movements")
    ]

    if "supplier_id" in columns:
        try:
            op.drop_constraint(
                "fk_inventory_movements_supplier_id",
                "inventory_movements",
                type_="foreignkey",
            )
        except Exception:
            pass
        op.drop_column("inventory_movements", "supplier_id")

    if "price_net" in columns:
        op.drop_column("inventory_movements", "price_net")
