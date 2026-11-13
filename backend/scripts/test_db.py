from app.db.session import SessionLocal
from app.models import Customer, RestaurantTable, MenuCategory


def test_database_operations():

    db = SessionLocal()

    try:
        # Create Customer
        customer = Customer(
            full_name="Test Customer",
            phone="9999999999"
        )

        db.add(customer)
        db.flush()

        print("Customer created:", customer.id)

        # Create Restaurant Table
        table = RestaurantTable(
            table_number="TEST-01",
            capacity=4
        )

        db.add(table)
        db.flush()

        print("Table created:", table.id)

        # Create Menu Category
        category = MenuCategory(
            name="Test Category",
            description="Database verification"
        )

        db.add(category)
        db.flush()

        print("Category created:", category.id)

        # Verify records
        assert db.get(Customer, customer.id) is not None
        assert db.get(RestaurantTable, table.id) is not None
        assert db.get(MenuCategory, category.id) is not None

        print("All database CRUD checks passed!")

        # Rollback test records
        db.rollback()

    except Exception as error:
        db.rollback()
        print("Database verification failed:", error)
        raise

    finally:
        db.close()


if __name__ == "__main__":
    test_database_operations()