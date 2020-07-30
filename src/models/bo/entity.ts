import { Table, Column, Model, AutoIncrement, PrimaryKey, AllowNull, DataType, BelongsTo, ForeignKey, HasMany} from 'sequelize-typescript'
import { User, Repository, Module, Property} from '..'

export enum TYPES { STRUCT = 'struct', EXCEPTION = 'exception', UNION = 'union' }

export enum REQUEST_PARAMS_TYPE {
    HEADERS = 1,
    QUERY_PARAMS = 2,
    BODY_PARAMS = 3,
}

@Table({ paranoid: true, freezeTableName: false, timestamps: true })
export default class Entity extends Model<Entity> {
    public static TYPES = TYPES

    @AutoIncrement
    @PrimaryKey
    @Column
    id: number

    @AllowNull(false)
    @Column({
        type: DataType.ENUM(TYPES.STRUCT, TYPES.EXCEPTION, TYPES.UNION),
        comment: 'property type',
    })
    /** Data Type */
    type: string

    @AllowNull(false)
    @Column(DataType.STRING(256))
    name: string

    @AllowNull(false)
    @Column(DataType.STRING(256))
    namespace: string

    @Column(DataType.TEXT)
    description: string

    @ForeignKey(() => User)
    @Column
    creatorId: number

    @ForeignKey(() => User)
    @Column
    lockerId: number

    @ForeignKey(() => Repository)
    @Column
    repositoryId: number

    @ForeignKey(() => Module)
    @Column
    moduleId: number

    @BelongsTo(() => User, 'creatorId')
    creator: User

    @BelongsTo(() => User, 'lockerId')
    locker: User

    @BelongsTo(() => Repository, 'repositoryId')
    repository: Repository

    @BelongsTo(() => Module, 'moduleId')
    module: Module

    @HasMany(() => Property, 'entityId')
    properties: Property[]

}