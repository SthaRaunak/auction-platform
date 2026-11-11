process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL ?? 'postgres://raunak@localhost:5432/bidwell_test';
process.env.UPLOAD_DIR ??= '/tmp/bidwell-test-uploads';
