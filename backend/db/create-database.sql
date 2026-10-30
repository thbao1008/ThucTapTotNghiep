-- Run manually ONCE against the local postgres maintenance database.
-- If aesp already exists, this fails rather than replacing it.
CREATE DATABASE aesp ENCODING 'UTF8' TEMPLATE template0;
