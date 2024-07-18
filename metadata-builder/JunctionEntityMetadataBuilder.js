"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.JunctionEntityMetadataBuilder = void 0;
const ColumnMetadata_1 = require("../metadata/ColumnMetadata");
const EntityMetadata_1 = require("../metadata/EntityMetadata");
const ForeignKeyMetadata_1 = require("../metadata/ForeignKeyMetadata");
const IndexMetadata_1 = require("../metadata/IndexMetadata");
const error_1 = require("../error");
const DriverUtils_1 = require("../driver/DriverUtils");
/**
 * Creates EntityMetadata for junction tables.
 * Junction tables are tables generated by many-to-many relations.
 */
class JunctionEntityMetadataBuilder {
    // -------------------------------------------------------------------------
    // Constructor
    // -------------------------------------------------------------------------
    constructor(connection) {
        this.connection = connection;
    }
    // -------------------------------------------------------------------------
    // Public Methods
    // -------------------------------------------------------------------------
    /**
     * Builds EntityMetadata for the junction of the given many-to-many relation.
     */
    build(relation, joinTable) {
        const referencedColumns = this.collectReferencedColumns(relation, joinTable);
        const inverseReferencedColumns = this.collectInverseReferencedColumns(relation, joinTable);
        const joinTableName = joinTable.name ||
            this.connection.namingStrategy.joinTableName(relation.entityMetadata.tableNameWithoutPrefix, relation.inverseEntityMetadata.tableNameWithoutPrefix, relation.propertyPath, relation.inverseRelation
                ? relation.inverseRelation.propertyName
                : "");
        const entityMetadata = new EntityMetadata_1.EntityMetadata({
            connection: this.connection,
            args: {
                target: "",
                name: joinTableName,
                type: "junction",
                database: joinTable.database || relation.entityMetadata.database,
                schema: joinTable.schema || relation.entityMetadata.schema,
                synchronize: joinTable.synchronize,
            },
        });
        entityMetadata.build();
        // create original side junction columns
        const junctionColumns = referencedColumns.map((referencedColumn) => {
            const joinColumn = joinTable.joinColumns
                ? joinTable.joinColumns.find((joinColumnArgs) => {
                    return ((!joinColumnArgs.referencedColumnName ||
                        joinColumnArgs.referencedColumnName ===
                            referencedColumn.propertyName) &&
                        !!joinColumnArgs.name);
                })
                : undefined;
            const columnName = joinColumn && joinColumn.name
                ? joinColumn.name
                : this.connection.namingStrategy.joinTableColumnName(relation.entityMetadata.tableNameWithoutPrefix, referencedColumn.propertyName, referencedColumn.databaseName);
            return new ColumnMetadata_1.ColumnMetadata({
                connection: this.connection,
                entityMetadata: entityMetadata,
                referencedColumn: referencedColumn,
                args: {
                    target: "",
                    mode: "virtual",
                    propertyName: columnName,
                    options: {
                        name: columnName,
                        length: !referencedColumn.length &&
                            (DriverUtils_1.DriverUtils.isMySQLFamily(this.connection.driver) ||
                                this.connection.driver.options.type ===
                                    "aurora-mysql") &&
                            // some versions of mariadb support the column type and should not try to provide the length property
                            this.connection.driver.normalizeType(referencedColumn) !== "uuid" &&
                            (referencedColumn.generationStrategy === "uuid" ||
                                referencedColumn.type === "uuid")
                            ? "36"
                            : referencedColumn.length, // fix https://github.com/typeorm/typeorm/issues/3604
                        width: referencedColumn.width,
                        type: referencedColumn.type,
                        precision: referencedColumn.precision,
                        scale: referencedColumn.scale,
                        charset: referencedColumn.charset,
                        collation: referencedColumn.collation,
                        zerofill: referencedColumn.zerofill,
                        unsigned: referencedColumn.zerofill
                            ? true
                            : referencedColumn.unsigned,
                        enum: referencedColumn.enum,
                        enumName: referencedColumn.enumName,
                        foreignKeyConstraintName: joinColumn?.foreignKeyConstraintName,
                        nullable: false,
                        primary: true,
                    },
                },
            });
        });
        // create inverse side junction columns
        const inverseJunctionColumns = inverseReferencedColumns.map((inverseReferencedColumn) => {
            const joinColumn = joinTable.inverseJoinColumns
                ? joinTable.inverseJoinColumns.find((joinColumnArgs) => {
                    return ((!joinColumnArgs.referencedColumnName ||
                        joinColumnArgs.referencedColumnName ===
                            inverseReferencedColumn.propertyName) &&
                        !!joinColumnArgs.name);
                })
                : undefined;
            const columnName = joinColumn && joinColumn.name
                ? joinColumn.name
                : this.connection.namingStrategy.joinTableInverseColumnName(relation.inverseEntityMetadata
                    .tableNameWithoutPrefix, inverseReferencedColumn.propertyName, inverseReferencedColumn.databaseName);
            return new ColumnMetadata_1.ColumnMetadata({
                connection: this.connection,
                entityMetadata: entityMetadata,
                referencedColumn: inverseReferencedColumn,
                args: {
                    target: "",
                    mode: "virtual",
                    propertyName: columnName,
                    options: {
                        length: !inverseReferencedColumn.length &&
                            (DriverUtils_1.DriverUtils.isMySQLFamily(this.connection.driver) ||
                                this.connection.driver.options.type ===
                                    "aurora-mysql") &&
                            // some versions of mariadb support the column type and should not try to provide the length property
                            this.connection.driver.normalizeType(inverseReferencedColumn) !== "uuid" &&
                            (inverseReferencedColumn.generationStrategy ===
                                "uuid" ||
                                inverseReferencedColumn.type === "uuid")
                            ? "36"
                            : inverseReferencedColumn.length, // fix https://github.com/typeorm/typeorm/issues/3604
                        width: inverseReferencedColumn.width, // fix https://github.com/typeorm/typeorm/issues/6442
                        type: inverseReferencedColumn.type,
                        precision: inverseReferencedColumn.precision,
                        scale: inverseReferencedColumn.scale,
                        charset: inverseReferencedColumn.charset,
                        collation: inverseReferencedColumn.collation,
                        zerofill: inverseReferencedColumn.zerofill,
                        unsigned: inverseReferencedColumn.zerofill
                            ? true
                            : inverseReferencedColumn.unsigned,
                        enum: inverseReferencedColumn.enum,
                        enumName: inverseReferencedColumn.enumName,
                        foreignKeyConstraintName: joinColumn?.foreignKeyConstraintName,
                        name: columnName,
                        nullable: false,
                        primary: true,
                    },
                },
            });
        });
        this.changeDuplicatedColumnNames(junctionColumns, inverseJunctionColumns);
        // set junction table columns
        entityMetadata.ownerColumns = junctionColumns;
        entityMetadata.inverseColumns = inverseJunctionColumns;
        entityMetadata.ownColumns = [
            ...junctionColumns,
            ...inverseJunctionColumns,
        ];
        entityMetadata.ownColumns.forEach((column) => (column.relationMetadata = relation));
        // create junction table foreign keys
        // Note: UPDATE CASCADE clause is not supported in Oracle.
        // Note: UPDATE/DELETE CASCADE clauses are not supported in Spanner.
        entityMetadata.foreignKeys = relation.createForeignKeyConstraints
            ? [
                new ForeignKeyMetadata_1.ForeignKeyMetadata({
                    entityMetadata: entityMetadata,
                    referencedEntityMetadata: relation.entityMetadata,
                    columns: junctionColumns,
                    referencedColumns: referencedColumns,
                    name: junctionColumns[0]?.foreignKeyConstraintName,
                    onDelete: this.connection.driver.options.type === "spanner"
                        ? "NO ACTION"
                        : relation.onDelete || "CASCADE",
                    onUpdate: this.connection.driver.options.type === "oracle" ||
                        this.connection.driver.options.type === "spanner"
                        ? "NO ACTION"
                        : relation.onUpdate || "CASCADE",
                }),
                new ForeignKeyMetadata_1.ForeignKeyMetadata({
                    entityMetadata: entityMetadata,
                    referencedEntityMetadata: relation.inverseEntityMetadata,
                    columns: inverseJunctionColumns,
                    referencedColumns: inverseReferencedColumns,
                    name: inverseJunctionColumns[0]?.foreignKeyConstraintName,
                    onDelete: this.connection.driver.options.type === "spanner"
                        ? "NO ACTION"
                        : relation.inverseRelation
                            ? relation.inverseRelation.onDelete
                            : "CASCADE",
                    onUpdate: this.connection.driver.options.type === "oracle" ||
                        this.connection.driver.options.type === "spanner"
                        ? "NO ACTION"
                        : relation.inverseRelation
                            ? relation.inverseRelation.onUpdate
                            : "CASCADE",
                }),
            ]
            : [];
        // create junction table indices
        entityMetadata.ownIndices = [
            new IndexMetadata_1.IndexMetadata({
                entityMetadata: entityMetadata,
                columns: junctionColumns,
                args: {
                    target: entityMetadata.target,
                    synchronize: true,
                },
            }),
            new IndexMetadata_1.IndexMetadata({
                entityMetadata: entityMetadata,
                columns: inverseJunctionColumns,
                args: {
                    target: entityMetadata.target,
                    synchronize: true,
                },
            }),
        ];
        // finally return entity metadata
        return entityMetadata;
    }
    // -------------------------------------------------------------------------
    // Protected Methods
    // -------------------------------------------------------------------------
    /**
     * Collects referenced columns from the given join column args.
     */
    collectReferencedColumns(relation, joinTable) {
        const hasAnyReferencedColumnName = joinTable.joinColumns
            ? joinTable.joinColumns.find((joinColumn) => !!joinColumn.referencedColumnName)
            : false;
        if (!joinTable.joinColumns ||
            (joinTable.joinColumns && !hasAnyReferencedColumnName)) {
            return relation.entityMetadata.columns.filter((column) => column.isPrimary);
        }
        else {
            return joinTable.joinColumns.map((joinColumn) => {
                const referencedColumn = relation.entityMetadata.columns.find((column) => column.propertyName === joinColumn.referencedColumnName);
                if (!referencedColumn)
                    throw new error_1.TypeORMError(`Referenced column ${joinColumn.referencedColumnName} was not found in entity ${relation.entityMetadata.name}`);
                return referencedColumn;
            });
        }
    }
    /**
     * Collects inverse referenced columns from the given join column args.
     */
    collectInverseReferencedColumns(relation, joinTable) {
        const hasInverseJoinColumns = !!joinTable.inverseJoinColumns;
        const hasAnyInverseReferencedColumnName = hasInverseJoinColumns
            ? joinTable.inverseJoinColumns.find((joinColumn) => !!joinColumn.referencedColumnName)
            : false;
        if (!hasInverseJoinColumns ||
            (hasInverseJoinColumns && !hasAnyInverseReferencedColumnName)) {
            return relation.inverseEntityMetadata.primaryColumns;
        }
        else {
            return joinTable.inverseJoinColumns.map((joinColumn) => {
                const referencedColumn = relation.inverseEntityMetadata.ownColumns.find((column) => column.propertyName ===
                    joinColumn.referencedColumnName);
                if (!referencedColumn)
                    throw new error_1.TypeORMError(`Referenced column ${joinColumn.referencedColumnName} was not found in entity ${relation.inverseEntityMetadata.name}`);
                return referencedColumn;
            });
        }
    }
    changeDuplicatedColumnNames(junctionColumns, inverseJunctionColumns) {
        junctionColumns.forEach((junctionColumn) => {
            inverseJunctionColumns.forEach((inverseJunctionColumn) => {
                if (junctionColumn.givenDatabaseName ===
                    inverseJunctionColumn.givenDatabaseName) {
                    const junctionColumnName = this.connection.namingStrategy.joinTableColumnDuplicationPrefix(junctionColumn.propertyName, 1);
                    junctionColumn.propertyName = junctionColumnName;
                    junctionColumn.givenDatabaseName = junctionColumnName;
                    const inverseJunctionColumnName = this.connection.namingStrategy.joinTableColumnDuplicationPrefix(inverseJunctionColumn.propertyName, 2);
                    inverseJunctionColumn.propertyName =
                        inverseJunctionColumnName;
                    inverseJunctionColumn.givenDatabaseName =
                        inverseJunctionColumnName;
                }
            });
        });
    }
}
exports.JunctionEntityMetadataBuilder = JunctionEntityMetadataBuilder;

//# sourceMappingURL=JunctionEntityMetadataBuilder.js.map
