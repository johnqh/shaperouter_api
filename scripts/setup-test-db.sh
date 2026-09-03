#!/bin/bash

# Create test database if it doesn't exist
# Requires PostgreSQL to be running locally

DB_NAME="shaperouter_test"

# Check if database exists
if psql -lqt | cut -d \| -f 1 | grep -qw "$DB_NAME"; then
  echo "Database $DB_NAME already exists"
else
  echo "Creating database $DB_NAME..."
  createdb "$DB_NAME"
  echo "Database $DB_NAME created"
fi

echo "Test database setup complete"
