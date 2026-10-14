# Imagen de la base de DESARROLLO LOCAL (spec 005): PostgreSQL 17 oficial + pgTAP y pg_prove.
# `pg_prove` lo trae el paquete Debian libtap-parser-sourcehandler-pgtap-perl.
FROM postgres:17

RUN apt-get update \
    && apt-get install -y --no-install-recommends postgresql-17-pgtap libtap-parser-sourcehandler-pgtap-perl \
    && rm -rf /var/lib/apt/lists/* \
    && pg_prove --version
